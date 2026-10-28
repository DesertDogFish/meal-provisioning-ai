package com.provision.integration;

import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.provision.exception.IntegrationUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fix-13: интеграция с Росстатом через ЕМИСС (fedstat.ru) — официальные
 * средние потребительские цены на продукты питания (рубли, ежемесячно,
 * по регионам РФ). Заменила демонтированную интеграцию Open Food Facts
 * (поисковый хост OFF недостижим из сети пользователя — TLS-блокировка
 * провайдера, а fallback-каталог Open Prices ограничен).
 *
 * <h3>Зачем</h3>
 * Приложению нужна «средняя цена по больнице» для плановых цен похода:
 * Росстат ежемесячно публикует очищенные усреднённые цены по ~сотне
 * базовых категорий («Гречневая крупа», «Тушёнка», «Молоко»…). Без ключей,
 * без лимитов по IP, данные уже в рублях (конвертация валют не нужна).
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
 *   <li>парсинг: CodeLists = словари измерений (каталог категорий),
 *       Series/Obs = ряды цен по месяцам.</li>
 * </ol>
 *
 * <h3>Гарантия «быстрого вызова» (требование Fix-13)</h3>
 * Два уровня кэша с TTL (integration.rosstat.cache-hours, дефолт 24ч —
 * данные обновляются раз в месяц, чаще не нужно):
 * <ul>
 *   <li>{@link #searchProducts} — Fix-14: возвращает и категорию, и её свежую
 *       цену. Цена берётся из полной SDMX-выгрузки, которая кэшируется
 *       (cache-hours) и отфильтрована по региону, — это одноразовый запрос,
 *       в установившемся режиме мгновенный из кэша. Если выгрузка недоступна —
 *       graceful-fallback на словарь категорий со страницы показателя (один GET)
 *       без цен: поиск не падает;</li>
 *   <li>{@link #fetchPrices} — полная SDMX-выгрузка, но вызывается только
 *       фоновой синхронизацией цен (POST /admin/integrations/ROSSTAT/sync/prices
 *       → 202 {logId}, UI не блокируется). При сбое обновления используется
 *       предыдущий кэш (graceful degradation).</li>
 * </ul>
 * Никаких ретраев с многоминутными паузами: одна попытка, понятная ошибка.
 *
 * <h3>Ограничения (честно)</h3>
 * <ul>
 *   <li>ЕМИСС блокирует запросы из зарубежных дата-центров (403 анти-бот) —
 *       работает из сети пользователя (РФ);</li>
 *   <li>категории общие: «йогурт питьевой», а не «йогурт со вкусом манго»;</li>
 *   <li>единицы измерения угадываются эвристикой по названию категории
 *       (яйца — ₽/10 шт, молоко — ₽/л, остальное — ₽/кг);</li>
 *   <li>обновление раз в месяц (для плановых цен достаточно).</li>
 * </ul>
 */
@Component
public class RosstatEmisProvider implements PriceProvider {

    private static final Logger log = LoggerFactory.getLogger(RosstatEmisProvider.class);

    /** Jackson, читающий JS-объектный литерал страницы ЕМИСС напрямую
     *  (нецитированные ключи, одинарные кавычки, trailing commas) — вместо
     *  хрупких строковых преобразований из fedstatAPIr (parse_js1/parse_js2). */
    private static final JsonMapper JS_MAPPER = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_UNQUOTED_FIELD_NAMES)
            .enable(JsonReadFeature.ALLOW_SINGLE_QUOTES)
            .enable(JsonReadFeature.ALLOW_TRAILING_COMMA)
            .build();

    private static final String ANTIBOT_403 =
            "ЕМИСС вернул 403 (анти-бот защита). Портал fedstat.ru блокирует запросы "
            + "из зарубежных дата-центров; убедитесь, что бэкенд выходит в интернет "
            + "из сети, где fedstat.ru открывается в браузере.";

    // ==================== Транспорт (seam для unit-тестов) ====================

    /** Ответ портала. `contentType` и `location` обязательны для диагностики (R10):
     *  отказ ЕМИСС различается именно по ним — `302` + `Location` означает «набор фильтров
     *  отклонён», а `200` + `text/html` — CSRF-блокировку или перерисованную страницу
     *  показателя. Без них обе ситуации выглядят одинаково («пришёл HTML»). */
    public record PageResult(int status, String body, String contentType, String location) {
        /** Совместимость с тестовыми фейками, которым заголовки не нужны. */
        public PageResult(int status, String body) {
            this(status, body, null, null);
        }
    }

    public interface Session extends AutoCloseable {
        PageResult get(String url) throws IOException;
        PageResult postForm(String url, String formBody) throws IOException;
        @Override void close();
    }

    public interface Transport {
        Session open();
    }

    // ==================== Внутренние модели ====================

    public record StrutsToken(String name, String value) {}

    /** Справочник одного поля фильтров страницы показателя. */
    public record EmisField(String id, String title, LinkedHashMap<String, String> values) {}

    public record EmisFilters(LinkedHashMap<String, EmisField> fields) {}

    /** Раскладка осей таблицы (left_columns+groups → строки, top_columns → колонки). */
    public record ObjectIds(List<String> line, List<String> column) {}

    public record PricePoint(LocalDate date, BigDecimal price) {}

    /** Кэш полной выгрузки: каталог категорий + ряды цен по категориям. */
    public record Snapshot(Instant fetchedAt,
                           LinkedHashMap<String, String> catalog,
                           Map<String, List<PricePoint>> prices) {}

    /** Каталог категорий без цен (быстрый путь searchProducts). */
    public record CatalogSnapshot(Instant fetchedAt, LinkedHashMap<String, String> catalog) {}

    public record PackGuess(BigDecimal amount, String unit) {}

    // ==================== Конфигурация ====================

    private final String baseUrl;
    private final String indicatorId;
    private final String regionTitle;
    private final Duration cacheTtl;
    /** Глубина истории цен в годах для поля «Год»; <=0 — выгружать весь ряд. */
    private final int periodMonths;
    private final Transport transport;

    private volatile Snapshot snapshot;
    private volatile CatalogSnapshot catalogSnapshot;

    @Autowired
    public RosstatEmisProvider(
            @Value("${integration.rosstat.base-url:https://www.fedstat.ru}") String baseUrl,
            @Value("${integration.rosstat.indicator-id:31448}") String indicatorId,
            @Value("${integration.rosstat.region:Российская Федерация}") String regionTitle,
            @Value("${integration.rosstat.cache-hours:24}") long cacheHours,
            @Value("${integration.rosstat.period-months:2}") int periodMonths,
            @Value("${integration.rosstat.user-agent:ProvisionApp/1.0 (dev@provision.app)}") String userAgent) {
        this(baseUrl, indicatorId, regionTitle, Duration.ofHours(Math.max(1, cacheHours)),
                periodMonths,
                new JdkTransport(userAgent, baseUrl.endsWith("/")
                        ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl));
    }

    /** Тестовый конструктор: транспорт подменяется фейком. */
    RosstatEmisProvider(String baseUrl, String indicatorId, String regionTitle,
                        Duration cacheTtl, int periodMonths, Transport transport) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.indicatorId = indicatorId;
        this.regionTitle = regionTitle;
        this.cacheTtl = cacheTtl;
        this.periodMonths = periodMonths;
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
        // (боль Fix-12: OFF-подключение жевало ~40с ретраев перед фолбэком).
        try (Session s = transport.open()) {
            PageResult p = s.get(baseUrl + "/indicator/" + indicatorId);
            if (p.status() == 200) {
                EmisFilters filters = parseFiltersFromPage(p.body());
                StrutsToken token = extractStrutsToken(p.body());
                if (token == null) {
                    return ConnectionStatus.error(
                            "ЕМИСС: страница показателя открылась, но не найден одноразовый токен "
                            + "выгрузки. Диагностика: " + pageDiagnostics(p.body())
                            + (filters == null ? "; справочник фильтров тоже не найден — вероятно, "
                                    + "это не страница показателя (проверьте ROSSTAT_INDICATOR_ID)" : ""));
                }
                EmisField goods = filters == null ? null : findGoodsField(filters);
                int n = goods == null ? -1 : goods.values().size();
                return ConnectionStatus.success("ЕМИСС: показатель " + indicatorId
                        + " («" + indicatorTitle(p.body(), filters) + "») доступен"
                        + (n >= 0 ? ", категорий в справочнике: " + n : ""));
            }
            if (p.status() == 403) {
                return ConnectionStatus.error(ANTIBOT_403);
            }
            return ConnectionStatus.error("ЕМИСС: HTTP " + p.status()
                    + " при открытии страницы показателя " + indicatorId);
        } catch (IOException e) {
            return ConnectionStatus.error("ЕМИСС недоступен: " + friendlyIo(e));
        }
    }

    @Override
    public List<ExternalProductDto> searchProducts(String query, int limit) {
        // Fix-14: поиск сразу возвращает и цену категории, чтобы админ видел
        // реальную цифру до привязки (боль «в результате даже цена не высвечивается»).
        //
        // Дефект №8 (plans/2026-10-28-emis-download-csrf-and-volume): справочник страницы
        // показателя ключуется id ЗНАЧЕНИЯ фильтра (Апельсины = 1743453), а SDMX-выгрузка —
        // кодом КЛАССИФИКАТОРА (Апельсины = 2703). Это разные пространства имён. Отданный
        // поиском code сохраняется в привязке товара и затем приходит в
        // fetchPrices(externalCode), который ищет ряды по коду классификатора, — при
        // рассогласовании привязанный товар не находит цену НИКОГДА. Поэтому каталог берём
        // из той же выгрузки, что и цены (CodeList «Виды товаров и услуг» в ответе содержит
        // всю номенклатуру, 885 позиций, независимо от выбранных фильтров).
        //
        // Выгрузка кэшируется (cache-hours, дефолт 24) и отфильтрована по региону, т.е. это
        // ОДНОРАТНЫЙ запрос (не «30 ретраев»), в установившемся режиме мгновенный из кэша.
        // Если она недоступна (анти-бот, истёк токен, портал лёг) — graceful-fallback на
        // словарь страницы: показываем справочник без цен, поиск не падает.
        LinkedHashMap<String, String> catalog = null;
        Map<String, List<PricePoint>> prices = Map.of();
        try {
            Snapshot snap = snapshotOrFetch();
            catalog = snap.catalog();
            prices = snap.prices();
        } catch (RuntimeException e) {
            log.warn("ЕМИСС: выгрузка цен для поиска недоступна ({}), показываю справочник страницы без цен",
                    e.getMessage());
        }
        if (catalog == null) {
            log.warn("ЕМИСС: справочник отдан по словарю страницы — его коды (id значений) не совпадают "
                    + "с кодами классификатора в ценах, привязка может не найти ряд");
            catalog = catalogOrFetch().catalog();
        }

        String q = normalize(query);
        int cap = limit <= 0 ? 50 : Math.min(limit, 200);
        List<ExternalProductDto> out = new ArrayList<>();
        for (Map.Entry<String, String> e : catalog.entrySet()) {
            if (out.size() >= cap) break;
            if (q.isEmpty() || normalize(e.getValue()).contains(q)) {
                PackGuess pack = guessPack(e.getValue());
                PricePoint last = lastPrice(prices.get(e.getKey()));
                out.add(new ExternalProductDto(e.getKey(), e.getValue(), "Росстат",
                        pack.amount(), pack.unit(), null,
                        last == null ? null : last.price(),
                        last == null ? null : last.date()));
            }
        }
        return out;
    }

    /** Последняя (самая свежая по дате) точка цены; null, если ряд пуст/отсутствует. */
    private static PricePoint lastPrice(List<PricePoint> points) {
        if (points == null || points.isEmpty()) return null;
        PricePoint best = points.get(0);
        for (PricePoint p : points) {
            if (p.date().isAfter(best.date())) best = p;
        }
        return best;
    }

    @Override
    public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
        Snapshot s = snapshotOrFetch();
        List<PricePoint> points = s.prices().getOrDefault(externalCode, List.of());
        List<ExternalPriceDto> out = new ArrayList<>();
        for (PricePoint p : points) {
            if (since != null && p.date().isBefore(since)) continue;
            out.add(new ExternalPriceDto(externalCode, p.price(), "RUB", p.date()));
        }
        out.sort(Comparator.comparing(ExternalPriceDto::date));
        return out;
    }

    // ==================== Загрузка данных ====================

    /** Быстрый путь: только словарь категорий (один GET страницы показателя). */
    private CatalogSnapshot catalogOrFetch() {
        CatalogSnapshot cur = this.catalogSnapshot;
        if (cur != null && !expired(cur.fetchedAt())) return cur;
        try (Session s = transport.open()) {
            PageResult page = s.get(baseUrl + "/indicator/" + indicatorId);
            if (page.status() == 403) throw new IntegrationUnavailableException(ANTIBOT_403);
            if (page.status() != 200) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: HTTP " + page.status() + " при открытии показателя " + indicatorId);
            }
            EmisFilters filters = parseFiltersFromPage(page.body());
            EmisField goods = filters == null ? null : findGoodsField(filters);
            if (goods == null || goods.values().isEmpty()) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: на странице показателя " + indicatorId
                        + " не найден справочник товаров (фильтр «Виды товаров…»). Диагностика: "
                        + pageDiagnostics(page.body()));
            }
            CatalogSnapshot fresh = new CatalogSnapshot(Instant.now(), new LinkedHashMap<>(goods.values()));
            this.catalogSnapshot = fresh;
            return fresh;
        } catch (IOException e) {
            if (cur != null) {
                log.warn("ЕМИСС: справочник не обновился ({}), использую кэш от {}", friendlyIo(e), cur.fetchedAt());
                return cur;
            }
            throw new IntegrationUnavailableException("ЕМИСС недоступен: " + friendlyIo(e), e);
        }
    }

    /** Тяжёлый путь: страница + токен + POST-выгрузка SDMX. Только для фоновой
     *  синхронизации цен; при сбое — предыдущий кэш, если он есть. */
    private Snapshot snapshotOrFetch() {
        Snapshot cur = this.snapshot;
        if (cur != null && !expired(cur.fetchedAt())) return cur;
        try {
            Snapshot fresh = downloadAndParse();
            this.snapshot = fresh;
            log.info("ЕМИСС: выгружено категорий {}, точек цен {}",
                    fresh.catalog().size(),
                    fresh.prices().values().stream().mapToInt(List::size).sum());
            return fresh;
        } catch (RuntimeException e) {
            if (cur != null) {
                log.warn("ЕМИСС: выгрузка не удалась ({}), использую кэш цен от {}",
                        e.getMessage(), cur.fetchedAt());
                return cur;
            }
            throw e;
        }
    }

    private boolean expired(Instant fetchedAt) {
        return fetchedAt.plus(cacheTtl).isBefore(Instant.now());
    }

    private Snapshot downloadAndParse() {
        try (Session s = transport.open()) {
            PageResult page = s.get(baseUrl + "/indicator/" + indicatorId);
            if (page.status() == 403) throw new IntegrationUnavailableException(ANTIBOT_403);
            if (page.status() != 200) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: HTTP " + page.status() + " при открытии показателя " + indicatorId);
            }
            StrutsToken token = extractStrutsToken(page.body());
            if (token == null) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: не найден одноразовый CSRF-токен. Диагностика: "
                        + pageDiagnostics(page.body()));
            }
            EmisFilters filters = parseFiltersFromPage(page.body());
            if (filters == null || filters.fields().isEmpty()) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: не удалось разобрать справочник фильтров страницы показателя");
            }
            ObjectIds objects = extractObjectIds(page.body());
            String title = indicatorTitle(page.body(), filters);
            String body = buildFormBody(title, token, objects, filters, regionTitle,
                    indicatorId, periodMonths, LocalDate.now());

            // R10: из лога должно быть видно, что именно мы отправили и что получили.
            // Счётчики берём ИЗ СОБРАННОГО ТЕЛА, а не из objects.line()/column(): оси
            // дополняются fallback-полями (вне left_columns/top_columns) уже внутри
            // buildFormBody, и на живой странице такая разница есть — 30611 «Единица
            // измерения» в осях не упомянут, но в lineObjectIds попадает.
            log.info("ЕМИСС: выгрузка SDMX indicator={} регион={} полей={} selectedFilterIds={} "
                            + "lineObjectIds={} columnObjectIds={} тело={} байт",
                    indicatorId, regionTitle, filters.fields().size(),
                    countParts(body, "selectedFilterIds="),
                    countParts(body, "lineObjectIds="), countParts(body, "columnObjectIds="),
                    body.length());
            long startedAt = System.nanoTime();
            PageResult data = s.postForm(baseUrl + "/indicator/downloadData.do?format=sdmx", body);
            long millis = (System.nanoTime() - startedAt) / 1_000_000L;
            log.info("ЕМИСС: ответ выгрузки status={} contentType={} location={} символов={} за {} мс",
                    data.status(), data.contentType(), data.location(),
                    data.body() == null ? 0 : data.body().length(), millis);

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
                        + describePayload(data));
            }
            if (data.status() != 200) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: выгрузка данных завершилась HTTP " + data.status()
                        + describePayload(data));
            }
            // FIX (дефект №4): смотрим не только на префикс тела, но и на Content-Type —
            // эталон принимает text/xml и application/vnd.ms-excel. В сообщение кладём
            // фактический тип и начало тела: заглушку «CSRF блокировка» (127 байт) должно
            // быть видно в журнале, а не угадывать.
            if (looksLikeHtml(data.body()) || !looksLikeData(data.contentType())) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС вернул не данные SDMX, а "
                        + (looksLikeHtml(data.body()) ? "HTML-страницу" : "ответ другого типа")
                        + describePayload(data)
                        + ". Одноразовый CSRF-токен берётся заново при каждой попытке; "
                        + "если в теле «CSRF блокировка» — имя поля токена на портале "
                        + "изменилось (ожидаем значение input[name=struts.token.name])");
            }
            Snapshot parsed = parseSdmx(data.body(), regionTitle);
            log.info("ЕМИСС: выгрузка разобрана — категорий={} рядов цен={} (indicator={})",
                    parsed.catalog().size(), parsed.prices().size(), indicatorId);
            return parsed;
        } catch (IOException e) {
            throw new IntegrationUnavailableException("ЕМИСС недоступен: " + friendlyIo(e), e);
        }
    }

    // ==================== Парсинг страницы (чистые функции — тестируемы) ====================

    /**
     * Одноразовый Struts-токен. Каноническая разметка fedstatAPIr —
     * div#downloadTokenHolder с парой hidden-input; живая проверка (Fix-13,
     * итерация 2) показала, что на некоторых страницах holder отсутствует,
     * поэтому ищем токены по всей странице:
     * <ol>
     *   <li>пара input[name=struts.token.name] + input[name=&lt;её значение&gt;]
     *       (сначала в чанке holder'а, затем во всём документе);</li>
     *   <li>одиночный input, чьё имя само выглядит как struts-токен
     *       («struts.token» / «*.token», но не «struts.token.name»).</li>
     * </ol>
     * Порядок и кавычки атрибутов name/value могут быть любыми.
     */
    static StrutsToken extractStrutsToken(String html) {
        int holder = html.indexOf("downloadTokenHolder");
        if (holder >= 0) {
            StrutsToken t = tokenFromChunk(
                    html.substring(holder, Math.min(html.length(), holder + 3000)));
            if (t != null) return t;
        }
        StrutsToken t = tokenFromChunk(html);
        if (t != null) return t;
        // Одиночный input: name="struts.token" value="…" без отдельного поля имени
        String solo = inputAttr(html, "struts.token", "value");
        return solo == null || solo.isBlank() ? null : new StrutsToken("struts.token", solo);
    }

    private static StrutsToken tokenFromChunk(String chunk) {
        String tokenName = inputAttr(chunk, "struts.token.name", "value");
        if (tokenName == null || tokenName.isBlank()) return null;
        String tokenValue = inputAttr(chunk, tokenName, "value");
        if (tokenValue == null || tokenValue.isBlank()) return null;
        return new StrutsToken(tokenName, tokenValue);
    }

    private static String inputAttr(String chunk, String inputName, String attrName) {
        Matcher m = Pattern.compile("<input[^>]*>", Pattern.CASE_INSENSITIVE).matcher(chunk);
        while (m.find()) {
            String tag = m.group();
            String name = tagAttr(tag, "name");
            if (inputName.equals(name)) {
                String v = tagAttr(tag, attrName);
                if (v != null) return v;
            }
        }
        return null;
    }

    private static String tagAttr(String tag, String attrName) {
        Matcher m = Pattern.compile("(?:^|\\s)" + Pattern.quote(attrName) + "\\s*=\\s*"
                        + "(?:\"([^\"]*)\"|'([^']*)')", Pattern.CASE_INSENSITIVE).matcher(tag);
        if (!m.find()) return null;
        String v = m.group(1) != null ? m.group(1) : m.group(2);
        return unescapeHtml(v);
    }

    /**
     * Человекочитаемая диагностика содержимого страницы для сообщений об ошибке:
     * заголовок, размер и наличие ключевых маркеров протокола. Живой ЕМИСС
     * недоступен из песочницы (анти-бот 403 для зарубежных дата-центров),
     * поэтому текст ошибки — единственный канал отладки разметки: пользователь
     * присылает тост, и по маркерам видно, что именно отдаёт портал
     * (заглушка «показатель не найден», капча, редизайн…).
     */
    static String pageDiagnostics(String html) {
        StringBuilder sb = new StringBuilder();
        Matcher title = Pattern.compile("<title[^>]*>(.*?)</title>",
                Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html);
        String t = title.find() ? unescapeHtml(title.group(1)).replaceAll("\\s+", " ").trim() : "";
        if (t.length() > 120) t = t.substring(0, 120) + "…";
        sb.append("страница «").append(t.isBlank() ? "без title" : t).append("», ")
          .append(html.length() / 1024).append(" КБ; маркеры: ");
        List<String> found = new ArrayList<>();
        for (String marker : new String[]{"downloadTokenHolder", "struts.token", "downloadData", "filters:"}) {
            if (html.contains(marker)) found.add(marker);
        }
        sb.append(found.isEmpty() ? "ни одного из downloadTokenHolder/struts.token/downloadData/filters"
                : String.join(", ", found));
        String text = html.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replaceAll("\\s+", " ").trim();
        if (text.length() > 220) text = text.substring(0, 220) + "…";
        sb.append("; текст: «").append(text).append("»");
        return sb.toString();
    }

    /** Словарь фильтров из встроенного JS страницы: объект после маркера «filters:».
     *  Границы — балансировкой скобок с учётом строк (надёжнее, чем «12-й тег
     *  script» из fedstatAPIr, который там помечен как «эмпирически»). */
    static EmisFilters parseFiltersFromPage(String html) {
        // Маркер «filters:» может встречаться на странице несколько раз —
        // перебираем вхождения, пока не распарсится валидный словарь.
        int from = 0;
        while (true) {
            int mi = html.indexOf("filters:", from);
            if (mi < 0) return null;
            from = mi + 1;
            EmisFilters parsed = parseFiltersBlock(extractBalancedFrom(html, mi + "filters:".length(), '{'));
            if (parsed != null) return parsed;
        }
    }

    private static EmisFilters parseFiltersBlock(String js) {
        if (js == null) return null;
        try {
            JsonNode root = JS_MAPPER.readTree(js);
            LinkedHashMap<String, EmisField> fields = new LinkedHashMap<>();
            var it = root.fields();
            while (it.hasNext()) {
                var entry = it.next();
                JsonNode f = entry.getValue();
                if (!f.isObject()) continue;
                String title = f.path("title").asText("");
                LinkedHashMap<String, String> values = new LinkedHashMap<>();
                JsonNode vs = f.path("values");
                if (vs.isObject()) {
                    var vit = vs.fields();
                    while (vit.hasNext()) {
                        var ve = vit.next();
                        JsonNode v = ve.getValue();
                        values.put(ve.getKey(), v.isObject() ? v.path("title").asText("") : v.asText(""));
                    }
                }
                fields.put(entry.getKey(), new EmisField(entry.getKey(), title, values));
            }
            return fields.isEmpty() ? null : new EmisFilters(fields);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** Раскладка осей: left_columns+groups → lineObjectIds, top_columns →
     *  columnObjectIds (маппинг fedstatAPIr parse_js2). */
    static ObjectIds extractObjectIds(String html) {
        List<String> line = new ArrayList<>();
        line.addAll(extractStringArray(html, "left_columns:"));
        line.addAll(extractStringArray(html, "groups:"));
        List<String> column = extractStringArray(html, "top_columns:");
        return new ObjectIds(line, column);
    }

    private static List<String> extractStringArray(String html, String marker) {
        String arr = extractBalanced(html, marker, '[');
        if (arr == null) return List.of();
        try {
            JsonNode node = JS_MAPPER.readTree(arr);
            List<String> out = new ArrayList<>();
            if (node.isArray()) {
                for (JsonNode n : node) out.add(n.asText());
            }
            return out;
        } catch (IOException e) {
            return List.of();
        }
    }

    /** Сбалансированное извлечение {…} или […] после маркера (учитывает строки
     *  в одинарных/двойных кавычках и экранирование). */
    static String extractBalanced(String text, String marker, char open) {
        int mi = text.indexOf(marker);
        if (mi < 0) return null;
        return extractBalancedFrom(text, mi + marker.length(), open);
    }

    static String extractBalancedFrom(String text, int fromIndex, char open) {
        char close = open == '{' ? '}' : ']';
        int start = text.indexOf(open, fromIndex);
        if (start < 0 || start - fromIndex > 200) return null; // маркер не про наш блок
        int depth = 0;
        char quote = 0;
        for (int i = start; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quote != 0) {
                if (c == '\\') i++;
                else if (c == quote) quote = 0;
                continue;
            }
            if (c == '\'' || c == '"') { quote = c; continue; }
            if (c == open) depth++;
            else if (c == close) {
                depth--;
                if (depth == 0) return text.substring(start, i + 1);
            }
        }
        return null;
    }

    /** Тело POST-формы downloadData.do (порядок частей — как в fedstatAPIr
     *  fedstat_post_data_ids_filtered: title, struts.token.name, &lt;имя токена&gt;, id,
     *  lineObjectIds, columnObjectIds, selectedFilterIds, filterObjectIds).
     *
     *  <p>Выбор значений: регион — из конфига (одно значение), поле «Период» — только
     *  {@code periodMonths} последних месяцев (см. {@link #valueIdsFor}), все остальные
     *  поля — все значения словаря. Все поля с несколькими значениями обязаны
     *  присутствовать в selectedFilterIds: иначе портал отвечает 302 («комбинация
     *  фильтров не даёт данных»).</p>
     *
     *  <p>ВНИМАНИЕ: сужать поле «Год» НЕЛЬЗЯ — портал отвечает 302 на любое его
     *  сужение (эксперименты E1/E2 владельца, 28.10.2026: 2026+2025 и 2023+2024 —
     *  оба 302, при этом полный набор годов — 200). Сужение «Периода» и «Товаров»
     *  портал принимает (F1: 1 месяц → 200, 5 649 772 байта; F2: 2 товара → 200,
     *  499 770 байт). Поэтому объём выгрузки режем по месяцам, а не по годам.</p>
     *
     * @param today точка отсчёта для окна месяцев (внедряется ради детерминизма тестов)
     */
    static String buildFormBody(String title, StrutsToken token, ObjectIds objects,
                                EmisFilters filters, String regionTitle, String indicatorId,
                                int periodMonths, LocalDate today) {
        List<String> selected = new ArrayList<>();
        List<String> line = new ArrayList<>(objects.line());
        List<String> column = new ArrayList<>(objects.column());
        // «0» — особое поле (сам показатель): в fedstatAPIr оно уходит в
        // filterObjectIds, а не в оси таблицы.
        boolean zeroSeen = line.contains("0") || column.contains("0");

        boolean hasFieldZero = false;
        for (EmisField f : filters.fields().values()) {
            if ("0".equals(f.id())) {
                hasFieldZero = true;
                for (String vid : f.values().keySet()) selected.add("0_" + vid);
                continue;
            }
            if (isRegionField(f)) {
                String vid = pickRegionValue(f, regionTitle);
                if (vid != null) selected.add(f.id() + "_" + vid);
            } else {
                for (String vid : valueIdsFor(f, periodMonths, today)) selected.add(f.id() + "_" + vid);
            }
            // Поля, не упомянутые в осях, по умолчанию — строки (default из parse_js2)
            if (!line.contains(f.id()) && !column.contains(f.id())) line.add(f.id());
        }
        if (!hasFieldZero) selected.add(0, "0_" + indicatorId);

        StringBuilder sb = new StringBuilder();
        appendForm(sb, "title", title);
        appendForm(sb, "struts.token.name", token.name());
        // FIX (дефект №1 плана 2026-10-28-emis-download-csrf-and-volume): имя CSRF-поля —
        // это значение input[name=struts.token.name] со страницы (на fedstat.ru — «token»),
        // а НЕ литерал «struts.token». С литералом портал не находит токен и отвечает
        // 200 + 127 байт «<p align="center">CSRF блокировка». Фолбэк — на случай, если имя
        // в разметке пустое.
        String tokenField = (token.name() == null || token.name().isBlank())
                ? "struts.token" : token.name();
        appendForm(sb, tokenField, token.value());
        // FIX (дефект №2 того же плана): без id=<показатель> экшен downloadData.do не знает,
        // что выгружать, и отвечает 200 + 41 КБ HTML — перерисованной страницей показателя.
        appendForm(sb, "id", indicatorId);
        for (String id : line) appendForm(sb, "lineObjectIds", id);
        for (String id : column) appendForm(sb, "columnObjectIds", id);
        for (String id : selected) appendForm(sb, "selectedFilterIds", id);
        if (!zeroSeen) appendForm(sb, "filterObjectIds", "0");
        return sb.toString();
    }

    /** Id значений поля, которые попадут в выгрузку.
     *
     *  <p>Сужаем только поле «Период»: оставляем {@code periodMonths} последних месяцев
     *  (см. {@link #recentMonths}). Причина (дефект №6 плана
     *  2026-10-28-emis-download-csrf-and-volume): полный ряд — 885 товаров × 450 ОКАТО ×
     *  27 лет × 12 месяцев, ответ ЕМИСС 65 076 787 байт, который читается в {@code String}
     *  (~130 МБ) и парсится полным DOM (пик ~600–700 МБ heap) — при типовых настройках
     *  контейнера это OutOfMemoryError. Один месяц — 5 649 772 байта (эксперимент F1).</p>
     *
     *  <p>Поле «Год» намеренно НЕ сужается: портал отвечает 302 на любое сужение этой оси
     *  (эксперименты E1/E2 — 2026+2025 и 2023+2024, оба 302; полный набор годов — 200).</p>
     *
     *  <p>Защитные случаи: {@code periodMonths <= 0} — не сужать; заголовки не распознаны
     *  как месяцы — не сужать (лучше выгрузить лишнее, чем молча потерять данные);
     *  нераспознанное значение внутри поля сохраняется всегда.</p> */
    static Collection<String> valueIdsFor(EmisField field, int periodMonths, LocalDate today) {
        if (periodMonths <= 0 || !isPeriodField(field)) return field.values().keySet();
        Set<Integer> keep = recentMonths(periodMonths, today);
        Set<String> out = new LinkedHashSet<>();
        boolean matched = false;
        for (Map.Entry<String, String> e : field.values().entrySet()) {
            Integer month = monthFromRuName(e.getValue());
            if (month == null) {
                out.add(e.getKey());
            } else if (keep.contains(month)) {
                out.add(e.getKey());
                matched = true;
            }
        }
        return matched ? out : field.values().keySet();
    }

    /** Номера {@code count} последних месяцев, заканчивая ПРОШЛЫМ: данные за текущий месяц
     *  ЕМИСС публикует только на 6–10-й рабочий день после его окончания, поэтому текущий
     *  месяц в окно не берём. Пример: сегодня 28.10.2026, count=2 → {9, 8}. */
    static Set<Integer> recentMonths(int count, LocalDate today) {
        Set<Integer> out = new LinkedHashSet<>();
        LocalDate cursor = today.minusMonths(1);
        for (int i = 0; i < Math.min(Math.max(count, 0), 12); i++) {
            out.add(cursor.getMonthValue());
            cursor = cursor.minusMonths(1);
        }
        return out;
    }

    /** Поле месяцев («Период»). Поле «Год» сюда не попадает намеренно: его сужение
     *  портал отклоняет (302), см. {@link #valueIdsFor}. */
    static boolean isPeriodField(EmisField f) {
        if (f == null || f.title() == null) return false;
        String t = normalize(f.title()).strip();
        return t.equals("период") || t.startsWith("период ");
    }

    private static void appendForm(StringBuilder sb, String key, String value) {
        if (!sb.isEmpty()) sb.append('&');
        sb.append(URLEncoder.encode(key, StandardCharsets.UTF_8))
          .append('=')
          .append(URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8));
    }

    static boolean isRegionField(EmisField f) {
        String t = normalize(f.title());
        return t.contains("окато") || t.contains("территор") || t.contains("регион");
    }

    /** Значение региона: точное совпадение → вхождение конфига → «российская…» → первое. */
    static String pickRegionValue(EmisField f, String regionTitle) {
        if (f.values().isEmpty()) return null;
        String want = normalize(regionTitle);
        for (var e : f.values().entrySet()) {
            if (normalize(e.getValue()).equals(want)) return e.getKey();
        }
        for (var e : f.values().entrySet()) {
            if (normalize(e.getValue()).contains(want)) return e.getKey();
        }
        for (var e : f.values().entrySet()) {
            if (normalize(e.getValue()).contains("российск")) return e.getKey();
        }
        return f.values().keySet().iterator().next();
    }

    static EmisField findGoodsField(EmisFilters filters) {
        for (EmisField f : filters.fields().values()) {
            String t = normalize(f.title());
            if ((t.contains("товар") || t.contains("продукт") || t.contains("номенклатур"))
                    && !t.contains("услуг")) {
                return f;
            }
        }
        // «Виды товаров и услуг» — самый частый заголовок у ценовых показателей
        for (EmisField f : filters.fields().values()) {
            if (normalize(f.title()).contains("товар")) return f;
        }
        return null;
    }

    static String indicatorTitle(String html, EmisFilters filters) {
        if (filters != null) {
            EmisField zero = filters.fields().get("0");
            // В fedstatAPIr title = filter_value_title строки поля «0»
            if (zero != null && !zero.values().isEmpty()) {
                String vt = zero.values().values().iterator().next();
                if (vt != null && !vt.isBlank()) return vt;
            }
            if (zero != null && !zero.title().isBlank()) return zero.title();
        }
        Matcher m = Pattern.compile("<title>([^<]+)</title>", Pattern.CASE_INSENSITIVE).matcher(html);
        if (m.find()) {
            String t = unescapeHtml(m.group(1)).trim();
            t = t.replaceAll("\\s*[—|\\-–]\\s*ЕМИСС.*$", "").trim();
            if (!t.isBlank()) return t;
        }
        return "Показатель ЕМИСС";
    }

    // ==================== Парсинг SDMX GenericData ====================

    /**
     * SDMX-ответ downloadData.do: GenericData с CodeLists (словари измерений)
     * и DataSet/Series/Obs (ряды). Пространства имён игнорируем (localName),
     * DOCTYPE запрещён (XXE). Структура — по fedstat_parse_sdmx_to_table.
     */
    static Snapshot parseSdmx(String xml, String regionTitle) {
        Document doc;
        try {
            DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
            dbf.setNamespaceAware(true);
            dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            dbf.setXIncludeAware(false);
            dbf.setExpandEntityReferences(false);
            doc = dbf.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
        } catch (Exception e) {
            throw new IntegrationUnavailableException("ЕМИСС: SDMX-ответ не распознан: " + e.getMessage(), e);
        }

        // 1) CodeLists: fieldId -> (valueId -> title), fieldId -> title
        Map<String, LinkedHashMap<String, String>> codeLists = new LinkedHashMap<>();
        Map<String, String> codeListTitles = new HashMap<>();
        for (Element cl : descendants(doc.getDocumentElement(), "CodeList")) {
            String id = cl.getAttribute("id");
            if (id == null || id.isEmpty()) continue;
            LinkedHashMap<String, String> values = codeLists.computeIfAbsent(id, k -> new LinkedHashMap<>());
            String clTitle = "";
            for (Element code : children(cl, "Code")) {
                String v = code.getAttribute("value");
                values.put(v, code.getTextContent().trim());
            }
            for (Element name : children(cl, "Name")) {
                clTitle = name.getTextContent().trim();
                break;
            }
            codeListTitles.put(id, clTitle);
        }

        String productField = findFieldByTitle(codeListTitles, "товар", "продукт", "номенклатур");
        String regionField = findFieldByTitle(codeListTitles, "окато", "территор");
        String typeField = findFieldByTitle(codeListTitles, "виды показателя", "вид показателя");

        // «Виды показателя»: если среди значений есть цены — берём только их
        // (рядом могут лежать индексы). Если цен нет — не фильтруем.
        String typePriceCode = null;
        boolean typeHasPrices = false;
        if (typeField != null) {
            for (var e : codeLists.getOrDefault(typeField, new LinkedHashMap<String, String>()).entrySet()) {
                if (normalize(e.getValue()).contains("цен")) {
                    typeHasPrices = true;
                    if (typePriceCode == null) typePriceCode = e.getKey();
                }
            }
        }
        String regionCode = null;
        if (regionField != null) {
            EmisField rf = new EmisField(regionField, "", codeLists.getOrDefault(regionField, new LinkedHashMap<>()));
            regionCode = pickRegionValue(rf, regionTitle);
        }

        // 2) Series/Obs → цены по категориям
        LinkedHashMap<String, String> catalog =
                codeLists.getOrDefault(productField, new LinkedHashMap<>());
        Map<String, List<PricePoint>> prices = new HashMap<>();
        if (productField != null) {
            for (Element series : descendants(doc.getDocumentElement(), "Series")) {
                Map<String, String> dims = new HashMap<>();
                for (Element key : children(series, "SeriesKey")) {
                    for (Element v : children(key, "Value")) {
                        String concept = v.hasAttribute("concept") ? v.getAttribute("concept") : v.getAttribute("id");
                        dims.put(concept, v.getAttribute("value"));
                    }
                }
                String product = dims.get(productField);
                if (product == null) continue;
                if (typeField != null && typeHasPrices) {
                    String tv = dims.get(typeField);
                    String tt = tv == null ? "" :
                            normalize(codeLists.getOrDefault(typeField, new LinkedHashMap<>()).getOrDefault(tv, ""));
                    if (!tt.contains("цен")) continue;
                }
                if (regionField != null && regionCode != null) {
                    String rv = dims.get(regionField);
                    if (rv != null && !rv.equals(regionCode)) continue;
                }
                // SDMX 1.0 (боевая форма ЕМИСС): месяц — атрибут РЯДА, год — внутри OBS.
                Integer seriesMonth = monthFromRuName(seriesAttribute(series, "PERIOD"));
                for (Element obs : children(series, "Obs")) {
                    String raw = obsValue(obs);
                    LocalDate date = obsDate(obs, seriesMonth);
                    BigDecimal price = parseDecimal(raw);
                    if (date == null || price == null || price.compareTo(BigDecimal.ZERO) <= 0) continue;
                    prices.computeIfAbsent(product, k -> new ArrayList<>()).add(new PricePoint(date, price));
                }
            }
            prices.values().forEach(l -> l.sort(Comparator.comparing(PricePoint::date)));
        } else {
            throw new IntegrationUnavailableException(
                    "ЕМИСС: в SDMX-ответе не найдено измерение товаров (CodeList «Виды товаров…») — структура изменилась");
        }
        return new Snapshot(Instant.now(), catalog, prices);
    }

    private static String findFieldByTitle(Map<String, String> titles, String... needles) {
        for (var e : titles.entrySet()) {
            String t = normalize(e.getValue());
            for (String n : needles) {
                if (t.contains(n)) return e.getKey();
            }
        }
        return null;
    }

    private static String obsDimension(Element obs) {
        for (Element d : children(obs, "ObsDimension")) {
            if (d.hasAttribute("value")) return d.getAttribute("value");
            if (!d.getTextContent().isBlank()) return d.getTextContent().trim();
        }
        for (Element d : children(obs, "TimePeriod")) {
            if (!d.getTextContent().isBlank()) return d.getTextContent().trim();
        }
        for (Element key : children(obs, "ObsKey")) {
            for (Element v : children(key, "Value")) {
                String s = v.hasAttribute("value") ? v.getAttribute("value") : v.getTextContent().trim();
                if (s.matches("\\d{4}.*")) return s;
            }
        }
        return null;
    }

    private static String obsValue(Element obs) {
        for (Element v : children(obs, "ObsValue")) {
            if (v.hasAttribute("value")) return v.getAttribute("value");
            if (!v.getTextContent().isBlank()) return v.getTextContent().trim();
        }
        return null;
    }

    /**
     * Дата наблюдения (дефект №7 плана 2026-10-28-emis-download-csrf-and-volume).
     *
     * <p>Боевой fedstat.ru отдаёт SDMX <b>1.0</b>, где год лежит в {@code Obs/generic:Time},
     * а месяц — в атрибуте ряда {@code Attributes/Value[@concept="PERIOD"]} русским
     * названием. Прежний код искал только {@code ObsDimension}/{@code TimePeriod}/
     * {@code ObsKey} (форма SDMX 2.1) и на реальном ответе не находил ничего: каждая
     * точка отбрасывалась, и успешная выгрузка давала ноль цен.</p>
     *
     * <p>Порядок: {@code Obs/Time} + месяц ряда → {@code Obs/Time} как есть →
     * прежний путь {@code obsDimension}. Годовые ряды без месяца дают 1 января.</p>
     */
    static LocalDate obsDate(Element obs, Integer seriesMonth) {
        String time = childText(obs, "Time");
        if (time != null) {
            LocalDate parsed = parsePeriod(time);
            if (parsed != null) {
                if (seriesMonth != null && time.matches("\\d{4}")) {
                    return LocalDate.of(parsed.getYear(), seriesMonth, 1);
                }
                return parsed;
            }
        }
        return parsePeriod(obsDimension(obs));
    }

    /** Значение атрибута ряда ({@code generic:Attributes/generic:Value}) по имени концепта. */
    static String seriesAttribute(Element series, String concept) {
        for (Element attrs : children(series, "Attributes")) {
            for (Element v : children(attrs, "Value")) {
                String c = v.hasAttribute("concept") ? v.getAttribute("concept") : v.getAttribute("id");
                if (concept.equalsIgnoreCase(c)) {
                    return v.hasAttribute("value") ? v.getAttribute("value") : v.getTextContent().trim();
                }
            }
        }
        return null;
    }

    private static String childText(Element parent, String localName) {
        for (Element e : children(parent, localName)) {
            String t = e.getTextContent();
            if (t != null && !t.isBlank()) return t.trim();
        }
        return null;
    }

    /** Основы русских названий месяцев; «мар» проверяется раньше «ма», чтобы март не стал маем. */
    private static final String[] RU_MONTH_STEMS =
            {"янв", "фев", "мар", "апр", "ма", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"};

    /** «январь»/«января»/«ЯНВАРЬ» → 1; «I квартал», null, пустая строка → null. */
    static Integer monthFromRuName(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim().toLowerCase(java.util.Locale.ROOT).replace('ё', 'е');
        for (int i = 0; i < RU_MONTH_STEMS.length; i++) {
            if (t.startsWith(RU_MONTH_STEMS[i])) return i + 1;
        }
        return null;
    }

    /** «2024-09» / «2024M09» / «2024-09-01» / «2024» → первый день периода. */
    static LocalDate parsePeriod(String s) {
        if (s == null || s.isBlank()) return null;
        s = s.trim();
        Matcher m = Pattern.compile("^(\\d{4})[-/M]?(\\d{2})(?:[-/]?(\\d{2}))?$").matcher(s);
        if (m.matches()) {
            int y = Integer.parseInt(m.group(1));
            int mo = Integer.parseInt(m.group(2));
            if (m.group(3) != null) {
                try { return LocalDate.of(y, mo, Integer.parseInt(m.group(3))); } catch (Exception ignore) { }
            }
            if (mo >= 1 && mo <= 12) {
                try { return LocalDate.of(y, mo, 1); } catch (Exception ignore) { }
            }
            return null;
        }
        if (s.matches("^\\d{4}$")) {
            try { return LocalDate.of(Integer.parseInt(s), 1, 1); } catch (Exception ignore) { }
        }
        return null;
    }

    private static BigDecimal parseDecimal(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return new BigDecimal(s.trim().replace(',', '.').replace(" ", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ==================== Единицы измерения (эвристика) ====================

    /**
     * Росстат отдаёт цену «за единицу категории»: большинство — ₽/кг,
     * молоко/кефир/соки — ₽/л, яйца — ₽/10 шт. packUnit ОБЯЗАТЕЛЕН:
     * IntegrationService.convertToIngredientUnit(null, …) возвращает null,
     * и цена была бы молча отброшена.
     */
    static PackGuess guessPack(String categoryTitle) {
        String t = normalize(categoryTitle);
        if (t.contains("яйц")) return new PackGuess(BigDecimal.TEN, "PCS");
        for (String w : List.of("молоко", "кефир", "сок", "вода", "напиток", "квас", "морс")) {
            if (t.contains(w)) return new PackGuess(BigDecimal.ONE, "L");
        }
        return new PackGuess(BigDecimal.ONE, "KG");
    }

    // ==================== Утилиты ====================

    static String normalize(String s) {
        return s == null ? "" : s.toLowerCase().replaceAll("\\s+", " ").trim();
    }

    static boolean looksLikeHtml(String body) {
        String head = body == null ? "" : body.stripLeading();
        String lower = head.length() > 200 ? head.substring(0, 200).toLowerCase() : head.toLowerCase();
        return lower.startsWith("<!doctype html") || lower.startsWith("<html");
    }

    /** Content-Type похож на данные выгрузки. Эталон (fedstatAPIr) принимает
     *  {@code text/xml} и {@code application/vnd.ms-excel}. Отсутствие заголовка
     *  не блокирует: тестовые фейки и старые ответы заголовков не несут. */
    static boolean looksLikeData(String contentType) {
        if (contentType == null || contentType.isBlank()) return true;
        String ct = contentType.toLowerCase(Locale.ROOT);
        return ct.contains("xml") || ct.contains("excel") || ct.contains("octet-stream");
    }

    /** Фрагмент ответа для сообщения об ошибке (R10): фактический Content-Type, размер
     *  и начало тела в одну строку. Именно этого не хватало, когда портал отвечал
     *  «CSRF блокировка», а в журнале было «истёк одноразовый CSRF-токен». */
    private static String describePayload(PageResult p) {
        String body = p.body() == null ? "" : p.body().strip();
        String head = body.length() > 300 ? body.substring(0, 300) : body;
        head = head.replaceAll("\\s+", " ").strip();
        return " (Content-Type: " + (p.contentType() == null ? "<нет>" : p.contentType())
                + ", размер: " + body.length() + " симв."
                + (head.isEmpty() ? "" : ", начало тела: «" + head + "»") + ")";
    }

    /** Число частей формы с указанным именем — для лога (R10). Считаем по собранному телу,
     *  а не по исходным спискам: оси дополняются fallback-полями уже внутри
     *  {@link #buildFormBody}, поэтому размер `objects.line()` телу не равен. */
    static int countParts(String formBody, String key) {
        int count = 0;
        int i = formBody.indexOf(key);
        while (i >= 0) {
            count++;
            i = formBody.indexOf(key, i + key.length());
        }
        return count;
    }

    private static String unescapeHtml(String s) {
        return s.replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    }

    private static List<Element> children(Element parent, String localName) {
        List<Element> out = new ArrayList<>();
        NodeList nl = parent.getChildNodes();
        for (int i = 0; i < nl.getLength(); i++) {
            Node n = nl.item(i);
            if (n.getNodeType() == Node.ELEMENT_NODE && localName.equals(n.getLocalName())) {
                out.add((Element) n);
            }
        }
        return out;
    }

    private static List<Element> descendants(Element root, String localName) {
        List<Element> out = new ArrayList<>();
        NodeList all = root.getElementsByTagName("*");
        for (int i = 0; i < all.getLength(); i++) {
            Node n = all.item(i);
            if (localName.equals(n.getLocalName())) out.add((Element) n);
        }
        return out;
    }

    private static String friendlyIo(IOException e) {
        String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        if (e instanceof java.net.http.HttpTimeoutException || m.toLowerCase().contains("timed out")) {
            return "превышен таймаут (fedstat.ru отвечает медленно — попробуйте позже)";
        }
        if (e instanceof java.net.UnknownHostException) {
            return "не удалось определить адрес fedstat.ru (проверьте DNS/интернет контейнера)";
        }
        if (e instanceof java.net.ConnectException) {
            return "не удалось установить соединение с fedstat.ru";
        }
        return m;
    }

    // ==================== JDK-транспорт (cookie-сессия на пайплайн) ====================

    static class JdkTransport implements Transport {
        private final String userAgent;
        private final String baseUrl;

        JdkTransport(String userAgent, String baseUrl) {
            this.userAgent = userAgent;
            this.baseUrl = baseUrl;
        }

        @Override
        public Session open() {
            CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
            // GET — с редиректами (как httr::GET в эталоне): главная страница и страница
            // показателя могут отдаваться через 301/302, и это нормальный путь.
            HttpClient getter = baseBuilder(cookies)
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
            // FIX (дефект №3 плана 2026-10-28-emis-download-csrf-and-volume): POST —
            // БЕЗ следования редиректам, как httr::config(followlocation = FALSE) в эталоне.
            // ЕМИСС отвечает 302 + Location: /indicator/<id>.do, когда ОТКЛОНЯЕТ выгрузку
            // (комбинация фильтров не даёт данных / неизвестные id значений / слишком
            // широкий или узкий запрос). С Redirect.NORMAL мы уходили по Location,
            // получали 200 + HTML страницы показателя и сообщали «истёк CSRF-токен».
            HttpClient poster = baseBuilder(cookies)
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();
            JdkSession session = new JdkSession(getter, poster);
            session.warmUp(); // best-effort: cookie-сессия до первого целевого GET
            return session;
        }

        private HttpClient.Builder baseBuilder(CookieManager cookies) {
            return HttpClient.newBuilder()
                    .cookieHandler(cookies)
                    .connectTimeout(Duration.ofSeconds(10));
        }

        private class JdkSession implements Session {
            private final HttpClient getter;
            private final HttpClient poster;
            private boolean warmedUp;

            JdkSession(HttpClient getter, HttpClient poster) {
                this.getter = getter;
                this.poster = poster;
            }

            /** Прогрев сессии: GET главной страницы портала (JSESSIONID и пр.).
             *  Живая отладка Fix-13: страница показателя без прогретой сессии может
             *  отдаваться без формы выгрузки/токена. Ошибки проглатываем —
             *  целевой запрос сам сообщит о проблеме. */
            void warmUp() {
                if (warmedUp) return;
                warmedUp = true;
                try {
                    get(baseUrl);
                } catch (IOException | RuntimeException e) {
                    log.debug("ЕМИСС: прогрев сессии не удался (не критично): {}", e.getMessage());
                }
            }

            @Override
            public PageResult get(String url) throws IOException {
                HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(30))
                        .header("User-Agent", userAgent)
                        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                        .header("Accept-Language", "ru-RU,ru;q=0.9")
                        .GET()
                        .build();
                return send(getter, req);
            }

            @Override
            public PageResult postForm(String url, String formBody) throws IOException {
                HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                        // SDMX всей матрицы может выгружаться минутами — щедрый таймаут;
                        // выполняется только в фоновой синхронизации, UI не блокирует.
                        .timeout(Duration.ofSeconds(300))
                        .header("User-Agent", userAgent)
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .header("Accept", "application/xml,text/xml,*/*;q=0.8")
                        .header("Accept-Language", "ru-RU,ru;q=0.9")
                        .POST(HttpRequest.BodyPublishers.ofString(formBody, StandardCharsets.UTF_8))
                        .build();
                return send(poster, req);
            }

            private PageResult send(HttpClient httpClient, HttpRequest req) throws IOException {
                try {
                    HttpResponse<String> res = httpClient.send(req,
                            HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                    // FIX (дефект №4): заголовки обязательны для диагностики — по
                    // Content-Type отличаем SDMX от HTML-заглушки, по Location показываем,
                    // куда портал отправил бы нас при отказе 302.
                    return new PageResult(res.statusCode(), res.body(),
                            res.headers().firstValue("content-type").orElse(null),
                            res.headers().firstValue("location").orElse(null));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Запрос к ЕМИСС прерван", e);
                }
            }

            @Override
            public void close() {
                // HttpClient закрывается сборщиком мусора; явного close нет до Java 21
            }
        }
    }

}
