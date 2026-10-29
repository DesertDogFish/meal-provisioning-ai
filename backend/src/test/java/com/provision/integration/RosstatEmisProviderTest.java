package com.provision.integration;

import com.provision.exception.IntegrationUnavailableException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Fix-13: юнит-тесты RosstatEmisProvider (ЕМИСС/fedstat.ru).
 *
 * <p>Протокол воспроизводит CRAN-пакет fedstatAPIr (референсная реализация):
 * страница показателя → одноразовый Struts-токен из div#downloadTokenHolder →
 * POST downloadData.do?format=sdmx → SDMX GenericData (CodeLists + Series/Obs).
 * Живая проверка с сети пользователя — отдельным зондом (ЕМИСС блокирует
 * зарубежные дата-центры, 403), поэтому здесь — синтетические фикстуры,
 * структурно повторяющие документированный формат.</p>
 */
@DisplayName("RosstatEmisProvider: протокол ЕМИСС (токен, фильтры, SDMX-выгрузка)")
class RosstatEmisProviderTest {

    /** Фиксированная «сегодняшня» дата: окно месяцев в buildFormBody обязано быть
     *  детерминированным, иначе тесты плывут в зависимости от дня запуска. */
    static final LocalDate TODAY = LocalDate.of(2026, 10, 28);

    /** Фикстура страницы показателя: токен + JS-словарь фильтров + оси.
     *
     *  <p>Форма разметки сверена с живым fedstat.ru/indicator/31448 (curl-зонд владельца,
     *  28.10.2026, см. plans/done/2026-10-28-emis-download-csrf-and-volume.md):</p>
     *  <ul>
     *    <li>значение {@code struts.token.name} на портале — <b>{@code token}</b>, а не
     *        «struts.token». Прежняя фикстура выдумала «struts.token», из-за чего
     *        захардкоженное имя CSRF-поля в {@code buildFormBody} проходило тесты,
     *        а прод получал от портала страницу «CSRF блокировка» (127 байт);</li>
     *    <li>обе оси колонок на портале — {@code top_columns:[3, 33560]}: «Год» (2000…2026)
     *        и «Период» (12 месяцев, id значений 1540228…1540283). Сужает провайдер только
     *        «Период»: сужение «Года» портал отклоняет (302), см. дефект №6 плана. Здесь
     *        оба поля в осях и с несколькими значениями, чтобы
     *        проверять сужение глубины истории;</li>
     *    <li>поле 30611 «Единица измерения» на портале есть в {@code filters}, но НЕ
     *        упомянуто в осях (оно приходит в JS-массиве {@code filterObjectIds}, который
     *        эталон переименовывает в lineObjectIds) — в фикстуре оно воспроизводит
     *        fallback-ветку {@code buildFormBody}.</li>
     *  </ul> */
    static final String PAGE_HTML = """
            <html><head><title>Средние потребительские цены на товары и услуги — ЕМИСС</title></head>
            <body>
            <div id="downloadTokenHolder">
              <input type="hidden" name="struts.token.name" value="token">
              <input type="hidden" name="token" value="TOKEN123">
            </div>
            <script type="text/javascript">
            var grid = {
              filters: {
                '0': { title: 'Средние потребительские цены', values: { '31448': { title: 'Средние потребительские цены на товары и услуги' } } },
                '30': { title: 'Классификатор объектов административно-территориального деления (ОКАТО)', values: { '1': { title: 'Российская Федерация' }, '2': { title: 'Белгородская область' } } },
                '32': { title: 'Виды товаров и услуг', values: { '101': { title: 'Гречневая крупа' }, '102': { title: 'Молоко питьевое' }, '103': { title: 'Яйца куриные' } } },
                '33': { title: 'Год', values: { '2000': { title: '2000' }, '2001': { title: '2001' }, '2024': { title: '2024' }, '2025': { title: '2025' }, '2026': { title: '2026' } } },
                '33560': { title: 'Период', values: { '1540283': { title: 'январь' }, '1540282': { title: 'февраль' }, '1540236': { title: 'март' }, '1540229': { title: 'апрель' }, '1540235': { title: 'май' }, '1540234': { title: 'июнь' }, '1540233': { title: 'июль' }, '1540228': { title: 'август' }, '1540276': { title: 'сентябрь' }, '1540273': { title: 'октябрь' }, '1540272': { title: 'ноябрь' }, '1540230': { title: 'декабрь' } } },
                '30611': { title: 'Единица измерения', values: { '950351': { title: 'рубль' } } }
              },
              left_columns: ['30'],
              top_columns: ['33', '33560'],
              groups: ['32']
            };
            grid.init();
            </script>
            </body></html>
            """;

    /** Фикстура SDMX GenericData: RF + регион-конкурент, две категории, запятая-десятичная. */
    static final String SDMX_XML = """
            <?xml version="1.0" encoding="UTF-8"?>
            <GenericData xmlns="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message"
                         xmlns:generic="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic"
                         xmlns:structure="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure">
             <CodeLists>
              <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                <structure:Code value="1">Российская Федерация</structure:Code>
                <structure:Code value="2">Белгородская область</structure:Code>
              </structure:CodeList>
              <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                <structure:Code value="101">Гречневая крупа</structure:Code>
                <structure:Code value="102">Молоко питьевое</structure:Code>
                <!-- CodeList в ответе ЕМИСС — ПОЛНЫЙ словарь номенклатуры (на боевом
                     индикаторе 885 позиций), включая категории без рядов данных:
                     ряды в DataSet есть не для каждого кода. -->
                <structure:Code value="103">Яйца куриные</structure:Code>
              </structure:CodeList>
              <structure:CodeList id="33"><structure:Name>Период</structure:Name>
                <structure:Code value="2025-08">Август 2025</structure:Code>
                <structure:Code value="2025-09">Сентябрь 2025</structure:Code>
              </structure:CodeList>
             </CodeLists>
             <DataSet>
              <generic:Series>
               <generic:SeriesKey>
                 <generic:Value concept="30" value="1"/>
                 <generic:Value concept="32" value="101"/>
               </generic:SeriesKey>
               <generic:Obs><generic:ObsDimension value="2025-08"/><generic:ObsValue value="87.4"/></generic:Obs>
               <generic:Obs><generic:ObsDimension value="2025-09"/><generic:ObsValue value="89.1"/></generic:Obs>
              </generic:Series>
              <generic:Series>
               <generic:SeriesKey>
                 <generic:Value concept="30" value="2"/>
                 <generic:Value concept="32" value="101"/>
               </generic:SeriesKey>
               <generic:Obs><generic:ObsDimension value="2025-09"/><generic:ObsValue value="80.0"/></generic:Obs>
              </generic:Series>
              <generic:Series>
               <generic:SeriesKey>
                 <generic:Value concept="30" value="1"/>
                 <generic:Value concept="32" value="102"/>
               </generic:SeriesKey>
               <generic:Obs><generic:ObsDimension value="2025-09"/><generic:ObsValue value="91,5"/></generic:Obs>
              </generic:Series>
             </DataSet>
            </GenericData>
            """;

    /** Фейковый транспорт: страница + SDMX, счётчики вызовов, режим отказа. */
    static class FakeTransport implements Transport {
        int gets;
        int posts;
        String lastFormBody;
        int pageStatus = 200;
        int dataStatus = 200;
        String pageBody = PAGE_HTML;
        String dataBody = SDMX_XML;
        String dataContentType = "text/xml";
        String dataLocation;
        boolean ioFailure;

        @Override
        public Session open() {
            return new Session() {
                @Override
                public PageResult get(String url) throws IOException {
                    gets++;
                    if (ioFailure) throw new IOException("connection reset");
                    return new PageResult(pageStatus, pageBody);
                }

                @Override
                public PageResult postForm(String url, String formBody) throws IOException {
                    posts++;
                    lastFormBody = formBody;
                    if (ioFailure) throw new IOException("connection reset");
                    return new PageResult(dataStatus, dataBody,
                            dataContentType, dataLocation);
                }

                @Override
                public void close() { }
            };
        }
    }

    private static RosstatEmisProvider provider(FakeTransport t) {
        // Кэша больше нет: единственная точка входа — downloadSnapshot() («Синхронизировать»).
        return new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", 2, 33_554_432L, t);
    }

    // ==================== Чистые функции парсинга ====================

    @Test
    @DisplayName("extractStrutsToken: одноразовый CSRF из div#downloadTokenHolder")
    void extractsStrutsToken() {
        var token = EmisPortalPage.extractStrutsToken(PAGE_HTML);
        assertThat(token).isNotNull();
        assertThat(token.name()).isEqualTo("token");
        assertThat(token.value()).isEqualTo("TOKEN123");
    }

    @Test
    @DisplayName("extractStrutsToken: нет holder'а и токенов → null (страница изменилась/анти-бот)")
    void noTokenHolder() {
        assertThat(EmisPortalPage.extractStrutsToken("<html><body>403</body></html>")).isNull();
    }

    @Test
    @DisplayName("extractStrutsToken: живая разметка без div#downloadTokenHolder — пара input ищется по всему документу")
    void tokenWithoutHolderDiv() {
        // Имя CSRF-поля произвольное («token», а не «struts.token») — как на реальном портале.
        String html = """
                <html><body>
                <form action="/indicator/downloadData.do" method="post">
                  <input type="hidden" name="struts.token.name" value="token"/>
                  <input type="hidden" name="token" value="TOKEN-NOHOLDER"/>
                </form>
                </body></html>
                """;
        var token = EmisPortalPage.extractStrutsToken(html);
        assertThat(token).isNotNull();
        assertThat(token.name()).isEqualTo("token");
        assertThat(token.value()).isEqualTo("TOKEN-NOHOLDER");
    }

    @Test
    @DisplayName("extractStrutsToken: одиночный input name=struts.token (без поля имени), одинарные кавычки")
    void tokenSoloInput() {
        String html = "<html><body><input type='hidden' name='struts.token' value='SOLO42'></body></html>";
        var token = EmisPortalPage.extractStrutsToken(html);
        assertThat(token).isNotNull();
        assertThat(token.name()).isEqualTo("struts.token");
        assertThat(token.value()).isEqualTo("SOLO42");
    }

    @Test
    @DisplayName("pageDiagnostics: title, размер, маркеры и видимый текст — для отладки живой разметки")
    void diagnostics() {
        String d1 = EmisPortalPage.pageDiagnostics(PAGE_HTML);
        assertThat(d1).contains("Средние потребительские цены")
                .contains("downloadTokenHolder").contains("filters:");

        String stub = "<html><head><title>ЕМИСС</title></head><body>"
                + "<script>var x=1;</script><h1>Показатель не найден</h1></body></html>";
        String d2 = EmisPortalPage.pageDiagnostics(stub);
        assertThat(d2).contains("Показатель не найден")
                .contains("ни одного")
                .doesNotContain("var x=1"); // script не попадает в видимый текст
    }

    @Test
    @DisplayName("parseFiltersFromPage: JS-словарь (одинарные кавычки, нецитированные ключи)")
    void parsesFiltersDictionary() {
        var filters = EmisPortalPage.parseFiltersFromPage(PAGE_HTML);
        assertThat(filters).isNotNull();
        assertThat(filters.fields()).containsKeys("0", "30", "32", "33");

        var okato = filters.fields().get("30");
        assertThat(okato.title()).contains("ОКАТО");
        assertThat(okato.values()).containsEntry("1", "Российская Федерация");
        assertThat(EmisRequestForm.isRegionField(okato)).isTrue();

        var goods = EmisPortalPage.findGoodsField(filters);
        assertThat(goods).isNotNull();
        assertThat(goods.id()).isEqualTo("32");
        assertThat(goods.values()).hasSize(3)
                .containsEntry("101", "Гречневая крупа")
                .containsEntry("103", "Яйца куриные");
    }

    @Test
    @DisplayName("extractObjectIds: left_columns+groups → line, top_columns → column")
    void extractsAxisObjectIds() {
        var objects = EmisPortalPage.extractObjectIds(PAGE_HTML);
        assertThat(objects.line()).containsExactly("30", "32");
        // обе оси колонок, как на живом портале: top_columns [3 «Год», 33560 «Период»]
        assertThat(objects.column()).containsExactly("33", "33560");
    }

    @Test
    @DisplayName("buildFormBody: CSRF-поле под именем со страницы, id=, регион РФ (не все), товары и ГОД ЦЕЛИКОМ, период — последние N месяцев, filterObjectIds=0")
    void buildsFormBody() {
        var filters = EmisPortalPage.parseFiltersFromPage(PAGE_HTML);
        var objects = EmisPortalPage.extractObjectIds(PAGE_HTML);
        var token = EmisPortalPage.extractStrutsToken(PAGE_HTML);
        String body = EmisRequestForm.buildFormBody("Средние потребительские цены на товары и услуги",
                token, objects, filters, "Российская Федерация", "31448", 2, TODAY);

        // ДЕФЕКТ №1: имя CSRF-поля — то, что портал сам положил в struts.token.name
        // («token»), а не хардкод «struts.token». Иначе ответ — 127 байт «CSRF блокировка».
        assertThat(body).contains("struts.token.name=token");
        assertThat(body).contains("token=TOKEN123");
        assertThat(body).doesNotContain("struts.token=TOKEN123");
        // ДЕФЕКТ №2: без id= портал перерисовывает страницу показателя (41 КБ HTML).
        assertThat(body).contains("id=31448");
        // Порядок частей — как в эталоне (fedstatAPIr): title, struts.token.name, <имя>=<токен>, id
        assertThat(body.indexOf("struts.token.name=token"))
                .isLessThan(body.indexOf("&token=TOKEN123"));
        assertThat(body.indexOf("&token=TOKEN123"))
                .isLessThan(body.indexOf("&id=31448"));

        // Регион: выбран ТОЛЬКО код РФ (1), не Белгородская область (2)
        assertThat(body).contains("selectedFilterIds=30_1");
        assertThat(body).doesNotContain("selectedFilterIds=30_2");
        // Товары: все значения (полный ряд режем на своей стороне)
        assertThat(body).contains("selectedFilterIds=32_101");
        assertThat(body).contains("selectedFilterIds=32_102");
        assertThat(body).contains("selectedFilterIds=32_103");
        // ДЕФЕКТ №6, РЕГРЕСС-ЗАЩИТА: поле «Год» обязано уходить ЦЕЛИКОМ. Портал отвечает
        // 302 на любое сужение этой оси (E1: 2026+2025 → 302×4; E2: 2023+2024 → 302),
        // тогда как полный набор годов даёт 200 (D: 65 076 787 байт).
        assertThat(body).contains("selectedFilterIds=33_2000");
        assertThat(body).contains("selectedFilterIds=33_2001");
        assertThat(body).contains("selectedFilterIds=33_2024");
        assertThat(body).contains("selectedFilterIds=33_2025");
        assertThat(body).contains("selectedFilterIds=33_2026");
        // ДЕФЕКТ №6, объём: режем по «Периоду» — 2 последних месяца от TODAY (28.10.2026)
        // это сентябрь и август (текущий месяц не берём: данные ещё не опубликованы).
        // Сужение «Периода» портал принимает: F1 (1 месяц) → 200, 5 649 772 байта.
        assertThat(body).contains("selectedFilterIds=33560_1540276"); // сентябрь
        assertThat(body).contains("selectedFilterIds=33560_1540228"); // август
        assertThat(body).doesNotContain("selectedFilterIds=33560_1540283"); // январь
        assertThat(body).doesNotContain("selectedFilterIds=33560_1540273"); // октябрь
        // Поле «0» (сам показатель) — selected + filterObjectIds (вне осей)
        assertThat(body).contains("selectedFilterIds=0_31448");
        assertThat(body).contains("filterObjectIds=0");
        // Оси: 30 (left) и 32 (groups) — строки; 33 (top) — колонки; «0» не в осях
        assertThat(body).contains("lineObjectIds=30");
        assertThat(body).contains("lineObjectIds=32");
        assertThat(body).contains("columnObjectIds=33");
        assertThat(body).contains("columnObjectIds=33560");
        assertThat(body).doesNotContain("lineObjectIds=0");
        assertThat(body).doesNotContain("columnObjectIds=0");
        // Поле ВНЕ осей (на живой странице — 30611 «Единица измерения», его нет ни в
        // left_columns, ни в top_columns, ни в groups): fallback добавляет его в строки —
        // так же, как parse_js2 эталона (object_ids по умолчанию = lineObjectIds).
        assertThat(body).contains("lineObjectIds=30611");
        assertThat(body).contains("selectedFilterIds=30611_950351");
        // Кириллический title — URL-encoded
        assertThat(body).startsWith("title=%D0%A1%D1%80%D0%B5%D0%B4%D0%BD%D0%B8%D0%B5");
    }

    @Test
    @DisplayName("buildFormBody: period-months<=0 — все 12 месяцев (прежнее поведение)")
    void buildsFormBodyWithoutPeriodNarrowing() {
        var filters = EmisPortalPage.parseFiltersFromPage(PAGE_HTML);
        var objects = EmisPortalPage.extractObjectIds(PAGE_HTML);
        var token = EmisPortalPage.extractStrutsToken(PAGE_HTML);
        String body = EmisRequestForm.buildFormBody("Средние потребительские цены на товары и услуги",
                token, objects, filters, "Российская Федерация", "31448", 0, TODAY);

        assertThat(body).contains("selectedFilterIds=33560_1540283"); // январь
        assertThat(body).contains("selectedFilterIds=33560_1540230"); // декабрь
        assertThat(EmisRequestForm.countParts(body, "selectedFilterIds=33560_")).isEqualTo(12);
    }

    @Test
    @DisplayName("isPeriodField: «Период» — да; «Год», «ОКАТО», «Виды товаров» — нет")
    void detectsPeriodField() {
        var filters = EmisPortalPage.parseFiltersFromPage(PAGE_HTML);
        assertThat(EmisRequestForm.isPeriodField(filters.fields().get("33560"))).isTrue();
        assertThat(EmisRequestForm.isPeriodField(filters.fields().get("33"))).isFalse();
        assertThat(EmisRequestForm.isPeriodField(filters.fields().get("30"))).isFalse();
        assertThat(EmisRequestForm.isPeriodField(filters.fields().get("32"))).isFalse();
        assertThat(EmisRequestForm.isPeriodField(new EmisField(
                "33560", "Период (месяц)", new java.util.LinkedHashMap<>()))).isTrue();
        assertThat(EmisRequestForm.isPeriodField(new EmisField(
                "3", "Годы", new java.util.LinkedHashMap<>()))).isFalse();
        assertThat(EmisRequestForm.isPeriodField(null)).isFalse();
    }

    @Test
    @DisplayName("recentMonths: окно заканчивается ПРОШЛЫМ месяцем (данные за текущий ещё не вышли)")
    void recentMonthsEndsWithPreviousMonth() {
        assertThat(EmisRequestForm.recentMonths(2, LocalDate.of(2026, 10, 28)))
                .containsExactly(9, 8);
        assertThat(EmisRequestForm.recentMonths(3, LocalDate.of(2026, 1, 15)))
                .containsExactly(12, 11, 10); // переход через границу года
        assertThat(EmisRequestForm.recentMonths(0, LocalDate.of(2026, 10, 28))).isEmpty();
        assertThat(EmisRequestForm.recentMonths(50, LocalDate.of(2026, 10, 28))).hasSize(12);
    }

    @Test
    @DisplayName("countParts: счётчики для лога считаются по телу, а не по осям страницы (30611 добавляется fallback-ом)")
    void countsFormPartsFromBuiltBody() {
        var filters = EmisPortalPage.parseFiltersFromPage(PAGE_HTML);
        var objects = EmisPortalPage.extractObjectIds(PAGE_HTML);
        var token = EmisPortalPage.extractStrutsToken(PAGE_HTML);
        String body = EmisRequestForm.buildFormBody("Средние потребительские цены на товары и услуги",
                token, objects, filters, "Российская Федерация", "31448", 2, TODAY);

        // Оси со страницы: left_columns ['30'] + groups ['32'] = 2 строки,
        // top_columns ['33','33560'] = 2 колонки
        assertThat(objects.line()).containsExactly("30", "32");
        assertThat(objects.column()).containsExactly("33", "33560");
        // В теле строк БОЛЬШЕ: 30611 не упомянут в осях и добавлен fallback-ом.
        // Именно поэтому лог обязан считать по телу — иначе в журнале lineObjectIds=2 при трёх в запросе.
        assertThat(EmisRequestForm.countParts(body, "lineObjectIds=")).isEqualTo(3);
        assertThat(EmisRequestForm.countParts(body, "columnObjectIds=")).isEqualTo(2);
        // 0_31448 + 30_1 (только РФ) + 32_101/102/103 + 33_2000…2026 (все 5 лет)
        // + 33560 (2 месяца) + 30611_950351 = 13
        assertThat(EmisRequestForm.countParts(body, "selectedFilterIds=")).isEqualTo(13);
        assertThat(EmisRequestForm.countParts(body, "filterObjectIds=")).isEqualTo(1);
    }

    @Test
    @DisplayName("pickRegionValue: точное → вхождение → «российская…» → первое")
    void picksRegionValue() {
        var filters = EmisPortalPage.parseFiltersFromPage(PAGE_HTML);
        var okato = filters.fields().get("30");
        assertThat(EmisValues.pickRegionValue(okato, "Российская Федерация")).isEqualTo("1");
        assertThat(EmisValues.pickRegionValue(okato, "Белгородская")).isEqualTo("2");
        assertThat(EmisValues.pickRegionValue(okato, "Несуществующий регион")).isEqualTo("1"); // «российск…»
    }

    @Test
    @DisplayName("parseSdmx: CodeLists → каталог; Series/Obs → цены; чужой регион отброшен; запятая-десятичная")
    void parsesSdmx() {
        var snap = RosstatEmisProvider.parseSdmx(SDMX_XML, "Российская Федерация");

        assertThat(snap.catalog())
                .containsEntry("101", "Гречневая крупа")
                .containsEntry("102", "Молоко питьевое");

        var buckwheat = snap.prices().get("101");
        assertThat(buckwheat).hasSize(2); // белгородская серия (80.0) отброшена
        assertThat(buckwheat.get(0).date()).isEqualTo(LocalDate.of(2025, 8, 1));
        assertThat(buckwheat.get(0).price()).isEqualByComparingTo("87.4");
        assertThat(buckwheat.get(1).date()).isEqualTo(LocalDate.of(2025, 9, 1));
        assertThat(buckwheat.get(1).price()).isEqualByComparingTo("89.1");

        var milk = snap.prices().get("102");
        assertThat(milk).hasSize(1);
        assertThat(milk.get(0).price()).isEqualByComparingTo("91.5"); // «91,5» → 91.5
    }

    /**
     * Дефект №7 (plans/done/2026-10-28-emis-download-csrf-and-volume): синтетическая фикстура
     * {@link #SDMX_XML} описывает SDMX 2.1, где время — это {@code ObsDimension value="2025-08"}.
     * Боевой fedstat.ru отдаёт SDMX <b>1.0</b> другой формы: год лежит в {@code Obs/generic:Time},
     * а месяц — в {@code Series/Attributes/Value[@concept="PERIOD"]} русским названием
     * («январь»). {@code obsDimension()} не находил ни одного из трёх ожидаемых элементов,
     * {@code parsePeriod(null)} → null → каждый {@code Obs} отбрасывался: даже успешная
     * выгрузка давала НОЛЬ цен. Фикстура {@code emis/data-31448-real.xml} вырезана из
     * настоящего ответа портала (скачан владельцем 28.10.2026, 96 рядов), поэтому форма
     * здесь не додумана, а снята с прод-ответа.
     */
    @Test
    @DisplayName("parseSdmx: боевая форма SDMX 1.0 — год из Obs/Time, месяц из Attributes/PERIOD")
    void parsesRealEmisSdmxShape() throws IOException {
        var snap = RosstatEmisProvider.parseSdmx(resource("emis/data-31448-real.xml"),
                "Российская Федерация");

        // Каталог — из CodeList «Виды товаров и услуг»: ключ = код классификатора (не id значения!)
        assertThat(snap.catalog())
                .containsEntry("105", "Фарш мясной, кг")
                .containsEntry("2703", "Апельсины, кг");

        // Регион «Российская Федерация» = код 643; ряды «643004.АГ» и «030» отбрасываются
        assertThat(snap.prices()).containsOnlyKeys("105");

        var mince = snap.prices().get("105");
        assertThat(mince).hasSize(8); // 2 года × 4 месяца, ряд отсортирован по дате
        assertThat(mince.get(0).date()).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(mince.get(0).price()).isEqualByComparingTo("502.55"); // «502,55» → 502.55
        assertThat(mince.get(3).date()).isEqualTo(LocalDate.of(2025, 4, 1));
        assertThat(mince.get(4).date()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(mince.get(4).price()).isEqualByComparingTo("550.64");
        assertThat(mince.get(7).date()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(mince.get(7).price()).isEqualByComparingTo("557.59");
    }

    @Test
    @DisplayName("monthFromRuName: русские названия месяцев SDMX-атрибута PERIOD")
    void parsesRussianMonthNames() {
        assertThat(EmisValues.monthFromRuName("январь")).isEqualTo(1);
        assertThat(EmisValues.monthFromRuName("Февраль")).isEqualTo(2);
        assertThat(EmisValues.monthFromRuName("декабря")).isEqualTo(12);
        assertThat(EmisValues.monthFromRuName("  МАРТ ")).isEqualTo(3);
        assertThat(EmisValues.monthFromRuName("I квартал")).isNull();
        assertThat(EmisValues.monthFromRuName(null)).isNull();
    }

    private static String resource(String path) throws IOException {
        try (var in = RosstatEmisProviderTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IOException("нет тестового ресурса: " + path);
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    @Test
    @DisplayName("parsePeriod: YYYY-MM / YYYY-MM-DD / YYYY-MMM / YYYY / мусор")
    void parsesPeriods() {
        assertThat(EmisValues.parsePeriod("2025-09")).isEqualTo(LocalDate.of(2025, 9, 1));
        assertThat(EmisValues.parsePeriod("2025-09-15")).isEqualTo(LocalDate.of(2025, 9, 15));
        assertThat(EmisValues.parsePeriod("2025M09")).isEqualTo(LocalDate.of(2025, 9, 1));
        assertThat(EmisValues.parsePeriod("2025")).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(EmisValues.parsePeriod("не период")).isNull();
        assertThat(EmisValues.parsePeriod(null)).isNull();
    }

    // ==================== Поведение провайдера (fake transport) ====================

    @Test
    @DisplayName("code() = ROSSTAT (RecipeSource.valueOf(\"ROSSTAT\") обязан существовать)")
    void codeIsRosstat() {
        assertThat(provider(new FakeTransport()).code()).isEqualTo("ROSSTAT");
        assertThat(com.provision.entity.RecipeSource.valueOf("ROSSTAT")).isNotNull();
    }

    @Test
    @DisplayName("testConnection: 200 + токен → успех с числом категорий (один GET, без ретраев)")
    void testConnectionSuccess() {
        FakeTransport t = new FakeTransport();
        var status = provider(t).testConnection();
        assertThat(status.available()).isTrue();
        assertThat(status.message()).contains("31448").contains("категорий в справочнике: 3");
        assertThat(t.gets).isEqualTo(1);
        assertThat(t.posts).isZero(); // проверка подключения НЕ качает SDMX
    }

    @Test
    @DisplayName("testConnection: 403 → понятная ошибка про анти-бот/сеть РФ")
    void testConnection403() {
        FakeTransport t = new FakeTransport();
        t.pageStatus = 403;
        t.pageBody = "<h1>Forbidden</h1>";
        var status = provider(t).testConnection();
        assertThat(status.available()).isFalse();
        assertThat(status.message()).contains("403").contains("анти-бот");
    }

    @Test
    @DisplayName("testConnection: страница без токена → ошибка с диагностикой содержимого")
    void testConnectionNoToken() {
        FakeTransport t = new FakeTransport();
        t.pageBody = "<html><head><title>ЕМИСС</title></head><body><h1>Показатель не найден</h1></body></html>";
        var status = provider(t).testConnection();
        assertThat(status.available()).isFalse();
        assertThat(status.message())
                .contains("не найден одноразовый токен")
                .contains("Показатель не найден")
                .contains("ROSSTAT_INDICATOR_ID"); // справочника фильтров тоже нет → подсказка про id
    }

    @Test
    @DisplayName("downloadSnapshot: полная выгрузка SDMX, POST-тело с токеном, справочник и цены по месяцам")
    void downloadSnapshotFullPipeline() {
        FakeTransport t = new FakeTransport();
        var p = provider(t);

        EmisSnapshot snapshot = p.downloadSnapshot();
        assertThat(t.posts).isEqualTo(1);
        // CSRF-токен уходит в поле с именем, прочитанным со страницы, и запрос содержит id показателя
        assertThat(t.lastFormBody).contains("struts.token.name=token");
        assertThat(t.lastFormBody).contains("token=TOKEN123");
        assertThat(t.lastFormBody).contains("id=31448");
        assertThat(t.lastFormBody).doesNotContain("struts.token=TOKEN123");
        // справочник (CodeList товаров) и ряды цен — то, что укладывается в локальную копию
        assertThat(snapshot.catalog()).containsEntry("101", "Гречневая крупа");
        assertThat(snapshot.prices().get("101")).hasSize(2);
        assertThat(snapshot.prices().get("101").get(0).price()).isEqualByComparingTo("87.4");
        assertThat(snapshot.prices().get("101").get(0).date()).isEqualTo(LocalDate.of(2025, 8, 1));
        // неизвестная позиция — просто отсутствует, без ошибки
        assertThat(snapshot.prices()).doesNotContainKey("999");

        // кэша нет: каждый запуск синхронизации — новая выгрузка
        p.downloadSnapshot();
        assertThat(t.posts).isEqualTo(2);
    }

    @Test
    @DisplayName("ДЕФЕКТ №1/№4: страница «CSRF блокировка» (живые 127 байт портала) → в ошибке видны Content-Type и текст заглушки")
    void htmlInsteadOfSdmx() {
        FakeTransport t = new FakeTransport();
        // Дословный ответ fedstat.ru на POST с CSRF-токеном в поле не с тем именем (зонд A).
        t.dataBody = """
                <!DOCTYPE html>
                <html>
                <title>ЕМИСС</title>
                <body>
                <p align="center">CSRF блокировка\040
                </body>
                </html>""";
        t.dataContentType = "text/html;charset=UTF-8";
        var p = provider(t);

        assertThatThrownBy(p::downloadSnapshot)
                .isInstanceOf(IntegrationUnavailableException.class)
                // R10: по сообщению должно быть понятно, ЧТО именно ответил портал
                .hasMessageContaining("CSRF блокировка")
                .hasMessageContaining("text/html");
    }

    @Test
    @DisplayName("ДЕФЕКТ №3: 302 на POST — это отказ портала по фильтрам, а не «истёкший токен»; Location виден в ошибке")
    void redirect302IsReportedAsRejection() {
        FakeTransport t = new FakeTransport();
        t.dataStatus = 302;
        t.dataBody = "";
        t.dataContentType = null;
        t.dataLocation = "/indicator/31448.do";
        var p = provider(t);

        assertThatThrownBy(p::downloadSnapshot)
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("302")
                .hasMessageContaining("/indicator/31448.do")
                .hasMessageContaining("фильтр")
                .hasMessageNotContaining("истёк");
    }

    @Test
    @DisplayName("looksLikeHtml: распознаёт HTML-ошибку, не трогает XML")
    void detectsHtmlPayload() {
        assertThat(EmisTransport.looksLikeHtml("<!DOCTYPE html><html>")).isTrue();
        assertThat(EmisTransport.looksLikeHtml("  <html lang='ru'>")).isTrue();
        assertThat(EmisTransport.looksLikeHtml(SDMX_XML)).isFalse();
    }

    @Test
    @DisplayName("extractBalanced: строки со скобками внутри не ломают балансировку")
    void balancedExtractionWithStrings() {
        String text = "filters: { 'a': { title: 'Виды {не поле}', values: {} } } хвост";
        String block = EmisPortalPage.extractBalanced(text, "filters:", '{');
        assertThat(block).isEqualTo("{ 'a': { title: 'Виды {не поле}', values: {} } }");
    }

    // ==================== Загрузка выгрузки файлом (parseSnapshot, KB-1) ====================

    /** Байты тестового ресурса — путь ручной загрузки выгрузки админом. */
    private static byte[] resourceBytes(String path) throws IOException {
        try (var in = RosstatEmisProviderTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IOException("нет тестового ресурса: " + path);
            return in.readAllBytes();
        }
    }

    @Test
    @DisplayName("parseSnapshot: боевая выгрузка файлом разбирается тем же потоковым парсером")
    void parsesUploadedSnapshotFile() throws IOException {
        byte[] payload = resourceBytes("emis/data-31448-real.xml");

        EmisSnapshot snap = provider(new FakeTransport()).parseSnapshot(payload, "data-31448.xml");

        assertThat(snap.regionCode()).isEqualTo("643");
        assertThat(snap.catalog()).containsEntry("105", "Фарш мясной, кг");
        assertThat(snap.prices()).containsOnlyKeys("105");
        assertThat(snap.prices().get("105")).hasSize(8);
        assertThat(snap.prices().get("105").get(0).price()).isEqualByComparingTo("502.55");
    }

    @Test
    @DisplayName("parseSnapshot: пустой файл и null вместо имени — причина называет файл")
    void rejectsEmptyUpload() {
        var p = provider(new FakeTransport());

        assertThatThrownBy(() -> p.parseSnapshot(new byte[0], "empty.xml"))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("empty.xml")
                .hasMessageContaining("пуст");
        assertThatThrownBy(() -> p.parseSnapshot(null, null))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("без имени");
    }

    @Test
    @DisplayName("parseSnapshot: файл больше max-response-bytes отклоняется до разбора")
    void rejectsUploadOverByteLimit() {
        var p = new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", 2, 1024L, new FakeTransport());
        byte[] payload = new byte[2048];
        Arrays.fill(payload, (byte) '<');

        assertThatThrownBy(() -> p.parseSnapshot(payload, "big.xml"))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("2048 байт")
                .hasMessageContaining("превышает предел max-response-bytes=1024");
    }

    @Test
    @DisplayName("parseSnapshot: HTML вместо выгрузки — причина называет нужный ответ портала")
    void rejectsHtmlUpload() {
        byte[] html = "<!DOCTYPE html><html><body>CSRF блокировка</body></html>"
                .getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(() -> provider(new FakeTransport()).parseSnapshot(html, "page.html"))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("не похож на SDMX-выгрузку")
                .hasMessageContaining("downloadData.do?format=sdmx");
    }

    @Test
    @DisplayName("parseSnapshot: признак SDMX ищется в первых 64 КБ — глубже не заглядываем")
    void sniffsSdmxMarkerOnlyInFileHead() {
        // Намеренное ограничение KB-1: файл НЕ превращается в String, поэтому маркер ищется
        // только в начале. В реальном ответе портала GenericData — корневой элемент и виден
        // сразу; здесь проверяем границу поведения, чтобы её изменение было осознанным.
        String padded = "<?xml version=\"1.0\"?><!--" + "x".repeat(70_000) + "-->"
                + SDMX_XML.substring(SDMX_XML.indexOf("<GenericData"));

        assertThatThrownBy(() -> provider(new FakeTransport())
                .parseSnapshot(padded.getBytes(StandardCharsets.UTF_8), "padded.xml"))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("не похож на SDMX-выгрузку");
    }

    @Test
    @DisplayName("parseSnapshot: SDMX без позиций и рядов — «выгрузка пустая», а не «синк успешен, 0»")
    void rejectsSdmxWithoutAnyData() {
        String xml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <GenericData xmlns="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/message"
                             xmlns:generic="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/generic"
                             xmlns:structure="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/structure">
                 <CodeLists>
                  <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                  </structure:CodeList>
                 </CodeLists>
                 <DataSet/>
                </GenericData>
                """;

        assertThatThrownBy(() -> provider(new FakeTransport())
                .parseSnapshot(xml.getBytes(StandardCharsets.UTF_8), "no-data.xml"))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("нет ни позиций справочника, ни ценовых рядов");
    }

    // ==================== Диагностика сетевых отказов (R10) ====================

    /** Провайдер, у которого сессия бросает заданное исключение на любом запросе. */
    private static RosstatEmisProvider providerFailingWith(IOException e) {
        return new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", 2, 33_554_432L, () -> new Session() {
                    @Override
                    public PageResult get(String url) throws IOException {
                        throw e;
                    }

                    @Override
                    public PageResult postForm(String url, String formBody) throws IOException {
                        throw e;
                    }

                    @Override
                    public void close() { }
                });
    }

    @Test
    @DisplayName("Сетевой отказ: DNS, таймаут и connect объясняются по-человечески, прочее — как есть")
    void explainsIoFailures() {
        assertThatThrownBy(providerFailingWith(new UnknownHostException("www.fedstat.ru"))::downloadSnapshot)
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("не удалось определить адрес fedstat.ru");
        assertThatThrownBy(providerFailingWith(new HttpTimeoutException("request timed out"))::downloadSnapshot)
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("превышен таймаут");
        assertThatThrownBy(providerFailingWith(new ConnectException("Connection refused"))::downloadSnapshot)
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("не удалось установить соединение с fedstat.ru");
        assertThatThrownBy(providerFailingWith(new IOException("connection reset"))::downloadSnapshot)
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("connection reset");
    }

    @Test
    @DisplayName("testConnection: сетевой отказ — статус ошибки, а не исключение (UI не блокируется)")
    void testConnectionReportsIoFailureAsStatus() {
        var status = providerFailingWith(new UnknownHostException("www.fedstat.ru")).testConnection();

        assertThat(status.available()).isFalse();
        assertThat(status.message()).contains("ЕМИСС недоступен")
                .contains("не удалось определить адрес fedstat.ru");
    }
}
