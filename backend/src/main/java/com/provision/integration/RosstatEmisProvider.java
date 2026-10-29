package com.provision.integration;

import com.provision.exception.IntegrationUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PushbackInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

/**
 * Интеграция с Росстатом через ЕМИСС (fedstat.ru) — официальные средние потребительские
 * цены на продукты питания (рубли, ежемесячно, по регионам РФ).
 *
 * <h3>Зачем</h3>
 * Приложению нужна «средняя цена по больнице» для плановых цен похода:
 * Росстат ежемесячно публикует очищенные усреднённые цены по сотням
 * базовых категорий («Крупа гречневая-ядрица», «Консервы мясные», «Молоко питьевое»…).
 * Без ключей, без лимитов по IP, данные уже в рублях (конвертация валют не нужна).
 *
 * <h3>Роль модуля после перехода на локальную копию</h3>
 * Портал — только транспорт: этот класс умеет открыть страницу показателя, взять
 * одноразовый CSRF-токен, собрать форму и разобрать SDMX-ответ в
 * {@link EmisSnapshot}. Дальше слепок уходит в нашу БД ({@link com.provision.service.EmisMirrorService}),
 * а поиск позиций и цены читаются уже локально ({@link com.provision.service.EmisCatalogService}).
 * Кэша здесь нет намеренно: единственная точка входа — кнопка «Синхронизировать»,
 * и её смысл — положить в БД свежие данные, а не отдать вчерашние.
 *
 * <h3>Протокол (референс — CRAN-пакет fedstatAPIr)</h3>
 * Прямой ссылка-на-CSV у ЕМИСС нет: выгрузка — это Struts-форма с
 * одноразовым CSRF-токеном. Порт 1-в-1 протокола fedstatAPIr
 * (https://github.com/cran/fedstatAPIr, активно поддерживается):
 * <ol>
 *   <li>GET {base-url}/indicator/{indicator-id} — страница показателя
 *       (сессия с cookie);</li>
 *   <li>из div#downloadTokenHolder — одноразовый токен:
 *       input[name=struts.token.name] → имя, input[name=имя] → значение;</li>
 *   <li>из встроенного JS страницы — словарь фильтров (объект «filters: {…}»)
 *       и раскладка осей («left_columns/top_columns/groups»);</li>
 *   <li>POST {base-url}/indicator/downloadData.do?format=sdmx,
 *       form-urlencoded: title, struts.token.name, struts.token,
 *       lineObjectIds*, columnObjectIds*, selectedFilterIds* (field_value),
 *       filterObjectIds → SDMX GenericData XML;</li>
 *   <li>парсинг: CodeLists = словари измерений (справочник товаров, всегда полный),
 *       Series/Obs = ряды цен по месяцам.</li>
 * </ol>
 *
 * <h3>Состав модуля (BL-15: декомпозиция 29.10.2026)</h3>
 * Этот класс — только протокол: конфиг, порядок шагов, тексты ошибок. Остальное разнесено
 * по ответственностям и каждый файл ≤ 500 строк (R8/R9):
 * <ul>
 *   <li>{@link EmisPortalPage} — разбор HTML/JS страницы показателя: токен, словарь фильтров,
 *       оси таблицы;</li>
 *   <li>{@link EmisRequestForm} — тело POST-формы {@code downloadData.do} и правила выбора
 *       значений фильтров;</li>
 *   <li>{@link EmisTransport} — seam транспорта ({@link Session}, {@link Transport},
 *       {@link PageResult}, {@link StreamResult}) и диагностика ответов;
 *       реализация — {@link JdkEmisTransport};</li>
 *   <li>{@link SdmxStreamParser} — потоковый разбор SDMX (StAX, KB-1);</li>
 *   <li>{@link EmisValues} — чистые преобразования значений (периоды, десятичные, регион).</li>
 * </ul>
 *
 * <h3>Ограничения (честно)</h3>
 * <ul>
 *   <li>ЕМИСС блокирует запросы из зарубежных дата-центров (403 анти-бот) —
 *       работает из сети пользователя (РФ);</li>
 *   <li>портал отклоняет (302) сужение оси «Год», поэтому год уходит целиком,
 *       а окно хранения «два последних года» режется уже у нас
 *       ({@link com.provision.service.EmisMirrorService});</li>
 *   <li>позиции классификатора общие: «Консервы мясные, кг», а не «тушёнка говяжья 325 г»
 *       конкретного производителя;</li>
 *   <li>обновление раз в месяц (для плановых цен достаточно).</li>
 * </ul>
 */
@Component
public class RosstatEmisProvider implements PriceProvider, EmisDataSource {

    private static final Logger log = LoggerFactory.getLogger(RosstatEmisProvider.class);

    private static final String ANTIBOT_403 =
            "ЕМИСС вернул 403 (анти-бот защита). Портал fedstat.ru блокирует запросы "
            + "из зарубежных дата-центров; убедитесь, что бэкенд выходит в интернет "
            + "из сети, где fedstat.ru открывается в браузере.";

    /** Сколько байт начала файла смотрим в поисках признака SDMX (корневой элемент — в начале). */
    private static final int SNIFF_BYTES = 65_536;

    /**
     * Сколько байт начала ответа выгрузки читаем до разбора: там видны HTML-заглушка
     * «CSRF блокировка», пустое тело при 302 и прочий мусор, который портал отдаёт вместо
     * SDMX (дефекты №1/№3/№4 закрытого плана 2026-10-28-emis-download-csrf-and-volume).
     */
    private static final int HEAD_BYTES = 4096;

    // ==================== Конфигурация ====================

    private final String baseUrl;
    private final String indicatorId;
    private final String regionTitle;
    /** Глубина окна «Период» в месяцах; <=0 — все 12 месяцев
     *  (см. {@link EmisRequestForm#buildFormBody}). */
    private final int periodMonths;
    /** Предохранитель от runaway-ответа: при превышении ЧТЕНИЕ обрывается (дефект №6 → KB-1).
     *  Память от объёма ответа больше не зависит — разбор потоковый. */
    private final long maxResponseBytes;
    private final Transport transport;

    @Autowired
    public RosstatEmisProvider(
            @Value("${integration.rosstat.base-url:https://www.fedstat.ru}") String baseUrl,
            @Value("${integration.rosstat.indicator-id:31448}") String indicatorId,
            @Value("${integration.rosstat.region:Российская Федерация без учета новых субъектов (с 01.01.2023)}") String regionTitle,
            @Value("${integration.rosstat.period-months:0}") int periodMonths,
            @Value("${integration.rosstat.max-response-bytes:100663296}") long maxResponseBytes,
            @Value("${integration.rosstat.user-agent:ProvisionApp/1.0 (dev@provision.app)}") String userAgent) {
        this(baseUrl, indicatorId, regionTitle, periodMonths, maxResponseBytes,
                new JdkEmisTransport(userAgent, baseUrl.endsWith("/")
                        ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl));
    }

    /** Тестовый конструктор: транспорт подменяется фейком. */
    RosstatEmisProvider(String baseUrl, String indicatorId, String regionTitle,
                        int periodMonths, long maxResponseBytes, Transport transport) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.indicatorId = indicatorId;
        this.regionTitle = regionTitle;
        this.periodMonths = periodMonths;
        this.maxResponseBytes = maxResponseBytes;
        this.transport = transport;
    }

    @Override
    public String code() {
        return "ROSSTAT";
    }

    // ==================== PriceProvider ====================

    @Override
    public ConnectionStatus testConnection() {
        // Одна попытка, короткий таймаут — «подключить» не должно висеть минутами
        // (боль Fix-12: прежнее подключение жевало ~40с ретраев перед фолбэком).
        try (Session s = transport.open()) {
            PageResult p = s.get(baseUrl + "/indicator/" + indicatorId);
            if (p.status() == 200) {
                EmisFilters filters = EmisPortalPage.parseFiltersFromPage(p.body());
                StrutsToken token = EmisPortalPage.extractStrutsToken(p.body());
                if (token == null) {
                    return ConnectionStatus.error(
                            "ЕМИСС: страница показателя открылась, но не найден одноразовый токен "
                            + "выгрузки. Диагностика: " + EmisPortalPage.pageDiagnostics(p.body())
                            + (filters == null ? "; справочник фильтров тоже не найден — вероятно, "
                                    + "это не страница показателя (проверьте ROSSTAT_INDICATOR_ID)" : ""));
                }
                EmisField goods = filters == null ? null : EmisPortalPage.findGoodsField(filters);
                int n = goods == null ? -1 : goods.values().size();
                return ConnectionStatus.success("ЕМИСС: показатель " + indicatorId
                        + " («" + EmisPortalPage.indicatorTitle(p.body(), filters) + "») доступен"
                        + (n >= 0 ? ", категорий в справочнике: " + n : ""));
            }
            if (p.status() == 403) {
                return ConnectionStatus.error(ANTIBOT_403);
            }
            return ConnectionStatus.error("ЕМИСС: HTTP " + p.status()
                    + " при открытии страницы показателя " + indicatorId);
        } catch (IOException e) {
            return ConnectionStatus.error("ЕМИСС недоступен: " + EmisTransport.friendlyIo(e));
        }
    }

    // ==================== Загрузка данных ====================

    /**
     * Свежая выгрузка для синхронизации: страница показателя → токен → POST-форма → SDMX.
     * Кэш не используется (см. javadoc класса), исключения — {@code IntegrationUnavailableException}
     * с диагностикой фактического ответа портала.
     */
    @Override
    public EmisSnapshot downloadSnapshot() {
        EmisSnapshot fresh = downloadAndParse();
        log.info("ЕМИСС: выгружено позиций справочника {} , рядов цен {} (регион {})",
                fresh.catalog().size(), fresh.prices().size(), fresh.regionCode());
        return fresh;
    }

    /**
     * Разбор выгрузки, загруженной админом файлом («Интеграции → Загрузить файл выгрузки»).
     *
     * <p>Сеть не используется вообще: файл — тот же SDMX-ответ портала, поэтому разбирается
     * тем же потоковым парсером, что и ответ портала ({@link SdmxStreamParser}). Проверяем только то, что можем проверить без
     * портала: размер (тот же предел {@code max-response-bytes}, что и для HTTP-ответа) и
     * признак SDMX в теле — иначе админ получил бы «синк успешен, 0 точек» на произвольном
     * XML/HTML (портал на ошибку отдаёт HTML-страницу, а не выгрузку).</p>
     *
     * <p>AU-05: сигнатура потоковая ({@link InputStream} + declared-размер), файл не
     * копируется в heap. Предел размера проверяется по declared-размеру ДО чтения, а
     * {@code parseSdmx} дополнительно обрывает runaway-поток — поэтому защита от
     * превышения лимита не ослабла.</p>
     */
    @Override
    public EmisSnapshot parseSnapshot(InputStream payload, long sizeBytes, String fileName) {
        String name = fileName == null || fileName.isBlank() ? "без имени" : fileName;
        if (payload == null || sizeBytes <= 0) {
            throw new IntegrationUnavailableException("ЕМИСС: файл «" + name + "» пуст");
        }
        if (maxResponseBytes > 0 && sizeBytes > maxResponseBytes) {
            throw new IntegrationUnavailableException("ЕМИСС: файл «" + name + "» равен "
                    + sizeBytes + " байт и превышает предел max-response-bytes="
                    + maxResponseBytes);
        }
        // AU-05: файл больше НЕ материализуется в byte[]. Признак SDMX ищем в первых
        // SNIFF_BYTES, возвращая прочитанное обратно в поток (PushbackInputStream.unread),
        // после чего разбор идёт тем же потоковым парсером, что и ответ портала (KB-1).
        PushbackInputStream in = new PushbackInputStream(payload, SNIFF_BYTES);
        EmisSnapshot parsed;
        try {
            byte[] head = EmisTransport.readHead(in, SNIFF_BYTES);
            String headText = new String(head, StandardCharsets.UTF_8);
            if (!headText.contains("GenericData") && !headText.contains("generic:Series")) {
                throw new IntegrationUnavailableException("ЕМИСС: файл «" + name + "» не похож на "
                        + "SDMX-выгрузку (нет GenericData/generic:Series). Нужен ответ портала "
                        + "downloadData.do?format=sdmx, а не HTML-страница или XLS");
            }
            parsed = parseSdmx(in, regionTitle, maxResponseBytes);
        } catch (IOException e) {
            throw new IntegrationUnavailableException("ЕМИСС: файл «" + name + "» не удалось "
                    + "прочитать: " + EmisTransport.friendlyIo(e));
        }
        if (parsed.catalog().isEmpty() && parsed.prices().isEmpty()) {
            throw new IntegrationUnavailableException("ЕМИСС: в файле «" + name + "» нет ни "
                    + "позиций справочника, ни ценовых рядов — возможно, выгрузка пустая");
        }
        log.info("ЕМИСС: файл «{}» ({} байт) разобран — позиций справочника {}, рядов цен {}, регион {}",
                name, sizeBytes, parsed.catalog().size(), parsed.prices().size(),
                parsed.regionCode());
        return parsed;
    }

    private EmisSnapshot downloadAndParse() {
        try (Session s = transport.open()) {
            PageResult page = s.get(baseUrl + "/indicator/" + indicatorId);
            if (page.status() == 403) throw new IntegrationUnavailableException(ANTIBOT_403);
            if (page.status() != 200) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: HTTP " + page.status() + " при открытии показателя " + indicatorId);
            }
            StrutsToken token = EmisPortalPage.extractStrutsToken(page.body());
            if (token == null) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: не найден одноразовый CSRF-токен. Диагностика: "
                        + EmisPortalPage.pageDiagnostics(page.body()));
            }
            EmisFilters filters = EmisPortalPage.parseFiltersFromPage(page.body());
            if (filters == null || filters.fields().isEmpty()) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: не удалось разобрать справочник фильтров страницы показателя");
            }
            ObjectIds objects = EmisPortalPage.extractObjectIds(page.body());
            String title = EmisPortalPage.indicatorTitle(page.body(), filters);
            String body = EmisRequestForm.buildFormBody(title, token, objects, filters, regionTitle,
                    indicatorId, periodMonths, LocalDate.now());

            // R10: из лога должно быть видно, что именно мы отправили и что получили.
            // Счётчики берём ИЗ СОБРАННОГО ТЕЛА, а не из objects.line()/column(): оси
            // дополняются fallback-полями (вне left_columns/top_columns) уже внутри
            // buildFormBody, и на живой странице такая разница есть — 30611 «Единица
            // измерения» в осях не упомянут, но в lineObjectIds попадает.
            log.info("ЕМИСС: выгрузка SDMX indicator={} регион={} полей={} selectedFilterIds={} "
                            + "lineObjectIds={} columnObjectIds={} тело={} байт",
                    indicatorId, regionTitle, filters.fields().size(),
                    EmisRequestForm.countParts(body, "selectedFilterIds="),
                    EmisRequestForm.countParts(body, "lineObjectIds="), EmisRequestForm.countParts(body, "columnObjectIds="),
                    body.length());
            long startedAt = System.nanoTime();
            StreamResult data = s.postFormStream(
                    baseUrl + "/indicator/downloadData.do?format=sdmx", body);

            // Тело читаем потоком (KB-1), а для диагностики достаточно начала ответа: именно
            // там видны HTML-заглушка «CSRF блокировка», пустое тело при 302 и ответ не того типа.
            PushbackInputStream stream = new PushbackInputStream(data.body(), HEAD_BYTES);
            byte[] head = EmisTransport.readHead(stream, HEAD_BYTES);
            String headText = new String(head, StandardCharsets.UTF_8);
            boolean wholeBody = head.length < HEAD_BYTES;
            long millis = (System.nanoTime() - startedAt) / 1_000_000L;
            log.info("ЕМИСС: ответ выгрузки status={} contentType={} location={} начало={} байт{} "
                            + "за {} мс",
                    data.status(), data.contentType(), data.location(), head.length,
                    wholeBody ? " (тело прочитано целиком)" : " (тело не дочитано)", millis);

            // FIX (дефект №3): 3xx на POST — это ОТКАЗ портала, а не перенаправление, по
            // которому надо идти. Раньше HttpClient.Redirect.NORMAL уводил нас по Location
            // на /indicator/<id>.do, мы получали 200 + HTML страницы и сообщали «истёк
            // CSRF-токен» — то есть ставили неверный диагноз и чинили не то.
            if (data.status() >= 300 && data.status() < 400) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС отклонил выгрузку: HTTP " + data.status()
                        + (data.location() == null || data.location().isBlank()
                                ? "" : ", Location: " + data.location())
                        + ". Портал так отвечает, когда комбинация фильтров не даёт данных, "
                        + "id значений фильтров неизвестны, либо запрос слишком широкий/узкий. "
                        + "Проверьте ROSSTAT_INDICATOR_ID, ROSSTAT_REGION, ROSSTAT_PERIOD_MONTHS"
                        + EmisTransport.describeHead(data, headText, wholeBody));
            }
            if (data.status() != 200) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: выгрузка данных завершилась HTTP " + data.status()
                        + EmisTransport.describeHead(data, headText, wholeBody));
            }
            // FIX (дефект №4): смотрим не только на префикс тела, но и на Content-Type —
            // эталон принимает text/xml и application/vnd.ms-excel. В сообщение кладём
            // фактический тип и начало тела: заглушку «CSRF блокировка» (127 байт) должно
            // быть видно в журнале, а не угадывать.
            if (EmisTransport.looksLikeHtml(headText) || !EmisTransport.looksLikeData(data.contentType())) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС вернул не данные SDMX, а "
                        + (EmisTransport.looksLikeHtml(headText) ? "HTML-страницу" : "ответ другого типа")
                        + EmisTransport.describeHead(data, headText, wholeBody)
                        + ". Одноразовый CSRF-токен берётся заново при каждой попытке; "
                        + "если в теле «CSRF блокировка» — имя поля токена на портале "
                        + "изменилось (ожидаем значение input[name=struts.token.name])");
            }
            // Дефект №6 → KB-1: разбор потоковый, поэтому предел max-response-bytes обрывает
            // ЧТЕНИЕ по ходу разбора (прежний вариант отказывался парсить уже скачанный
            // целиком ответ — память к тому моменту была потрачена).
            EmisSnapshot parsed = parseSdmx(stream, regionTitle, maxResponseBytes);
            log.info("ЕМИСС: выгрузка разобрана — категорий={} рядов цен={} (indicator={})",
                    parsed.catalog().size(), parsed.prices().size(), indicatorId);
            return parsed;
        } catch (IOException e) {
            throw new IntegrationUnavailableException("ЕМИСС недоступен: " + EmisTransport.friendlyIo(e), e);
        }
    }

    // ==================== Парсинг SDMX GenericData ====================

    /**
     * SDMX-ответ downloadData.do: GenericData с CodeLists (словари измерений) и DataSet/Series/Obs
     * (ряды). Разбор ПОТОКОВЫЙ (StAX, {@link SdmxStreamParser}): в памяти живёт один ряд или один
     * словарь, а не весь документ — прежний DOM на полном ряде (65 МБ) требовал ~130 МБ на
     * {@code String} и пик 600–700 МБ heap (дефект KB-1). Пространства имён игнорируются
     * (localName), DTD запрещён (XXE). Структура — по fedstat_parse_sdmx_to_table.
     *
     * @param xml         SDMX-ответ текстом — путь фикстур тестов и диагностики
     * @param regionTitle название региона из конфига: по нему выбирается код ОКАТО рядов
     */
    static EmisSnapshot parseSdmx(String xml, String regionTitle) {
        return parseSdmx(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)),
                regionTitle, 0L);
    }

    /**
     * Потоковый разбор: ответ портала или файл, загруженный админом, читается по ходу разбора.
     *
     * @param xml      поток с SDMX-ответом (закрывает вызывающий код)
     * @param maxBytes предел объёма в байтах, ≤ 0 — без ограничения; при превышении чтение
     *                 обрывается с внятной причиной (прежний DOM-вариант отказывался парсить
     *                 уже скачанный целиком ответ — память к тому моменту была потрачена)
     */
    static EmisSnapshot parseSdmx(InputStream xml, String regionTitle, long maxBytes) {
        return SdmxStreamParser.parse(xml, regionTitle, maxBytes);
    }

}
