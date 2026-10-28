package com.provision.integration;

import com.provision.exception.IntegrationUnavailableException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Duration;
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
@DisplayName("RosstatEmisProvider: протокол ЕМИСС (токен, фильтры, SDMX, кэш)")
class RosstatEmisProviderTest {

    /** Фиксированная «сегодняшня» дата: окно месяцев в buildFormBody обязано быть
     *  детерминированным, иначе тесты плывут в зависимости от дня запуска. */
    static final LocalDate TODAY = LocalDate.of(2026, 10, 28);

    /** Фикстура страницы показателя: токен + JS-словарь фильтров + оси.
     *
     *  <p>Форма разметки сверена с живым fedstat.ru/indicator/31448 (curl-зонд владельца,
     *  28.10.2026, см. plans/2026-10-28-emis-download-csrf-and-volume.md):</p>
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
    static class FakeTransport implements RosstatEmisProvider.Transport {
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
        public RosstatEmisProvider.Session open() {
            return new RosstatEmisProvider.Session() {
                @Override
                public RosstatEmisProvider.PageResult get(String url) throws IOException {
                    gets++;
                    if (ioFailure) throw new IOException("connection reset");
                    return new RosstatEmisProvider.PageResult(pageStatus, pageBody);
                }

                @Override
                public RosstatEmisProvider.PageResult postForm(String url, String formBody) throws IOException {
                    posts++;
                    lastFormBody = formBody;
                    if (ioFailure) throw new IOException("connection reset");
                    return new RosstatEmisProvider.PageResult(dataStatus, dataBody,
                            dataContentType, dataLocation);
                }

                @Override
                public void close() { }
            };
        }
    }

    private static RosstatEmisProvider provider(FakeTransport t) {
        return new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", Duration.ofHours(24), 2, t);
    }

    // ==================== Чистые функции парсинга ====================

    @Test
    @DisplayName("extractStrutsToken: одноразовый CSRF из div#downloadTokenHolder")
    void extractsStrutsToken() {
        var token = RosstatEmisProvider.extractStrutsToken(PAGE_HTML);
        assertThat(token).isNotNull();
        assertThat(token.name()).isEqualTo("token");
        assertThat(token.value()).isEqualTo("TOKEN123");
    }

    @Test
    @DisplayName("extractStrutsToken: нет holder'а и токенов → null (страница изменилась/анти-бот)")
    void noTokenHolder() {
        assertThat(RosstatEmisProvider.extractStrutsToken("<html><body>403</body></html>")).isNull();
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
        var token = RosstatEmisProvider.extractStrutsToken(html);
        assertThat(token).isNotNull();
        assertThat(token.name()).isEqualTo("token");
        assertThat(token.value()).isEqualTo("TOKEN-NOHOLDER");
    }

    @Test
    @DisplayName("extractStrutsToken: одиночный input name=struts.token (без поля имени), одинарные кавычки")
    void tokenSoloInput() {
        String html = "<html><body><input type='hidden' name='struts.token' value='SOLO42'></body></html>";
        var token = RosstatEmisProvider.extractStrutsToken(html);
        assertThat(token).isNotNull();
        assertThat(token.name()).isEqualTo("struts.token");
        assertThat(token.value()).isEqualTo("SOLO42");
    }

    @Test
    @DisplayName("pageDiagnostics: title, размер, маркеры и видимый текст — для отладки живой разметки")
    void diagnostics() {
        String d1 = RosstatEmisProvider.pageDiagnostics(PAGE_HTML);
        assertThat(d1).contains("Средние потребительские цены")
                .contains("downloadTokenHolder").contains("filters:");

        String stub = "<html><head><title>ЕМИСС</title></head><body>"
                + "<script>var x=1;</script><h1>Показатель не найден</h1></body></html>";
        String d2 = RosstatEmisProvider.pageDiagnostics(stub);
        assertThat(d2).contains("Показатель не найден")
                .contains("ни одного")
                .doesNotContain("var x=1"); // script не попадает в видимый текст
    }

    @Test
    @DisplayName("parseFiltersFromPage: JS-словарь (одинарные кавычки, нецитированные ключи)")
    void parsesFiltersDictionary() {
        var filters = RosstatEmisProvider.parseFiltersFromPage(PAGE_HTML);
        assertThat(filters).isNotNull();
        assertThat(filters.fields()).containsKeys("0", "30", "32", "33");

        var okato = filters.fields().get("30");
        assertThat(okato.title()).contains("ОКАТО");
        assertThat(okato.values()).containsEntry("1", "Российская Федерация");
        assertThat(RosstatEmisProvider.isRegionField(okato)).isTrue();

        var goods = RosstatEmisProvider.findGoodsField(filters);
        assertThat(goods).isNotNull();
        assertThat(goods.id()).isEqualTo("32");
        assertThat(goods.values()).hasSize(3)
                .containsEntry("101", "Гречневая крупа")
                .containsEntry("103", "Яйца куриные");
    }

    @Test
    @DisplayName("extractObjectIds: left_columns+groups → line, top_columns → column")
    void extractsAxisObjectIds() {
        var objects = RosstatEmisProvider.extractObjectIds(PAGE_HTML);
        assertThat(objects.line()).containsExactly("30", "32");
        // обе оси колонок, как на живом портале: top_columns [3 «Год», 33560 «Период»]
        assertThat(objects.column()).containsExactly("33", "33560");
    }

    @Test
    @DisplayName("buildFormBody: CSRF-поле под именем со страницы, id=, регион РФ (не все), товары и ГОД ЦЕЛИКОМ, период — последние N месяцев, filterObjectIds=0")
    void buildsFormBody() {
        var filters = RosstatEmisProvider.parseFiltersFromPage(PAGE_HTML);
        var objects = RosstatEmisProvider.extractObjectIds(PAGE_HTML);
        var token = RosstatEmisProvider.extractStrutsToken(PAGE_HTML);
        String body = RosstatEmisProvider.buildFormBody("Средние потребительские цены на товары и услуги",
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
        var filters = RosstatEmisProvider.parseFiltersFromPage(PAGE_HTML);
        var objects = RosstatEmisProvider.extractObjectIds(PAGE_HTML);
        var token = RosstatEmisProvider.extractStrutsToken(PAGE_HTML);
        String body = RosstatEmisProvider.buildFormBody("Средние потребительские цены на товары и услуги",
                token, objects, filters, "Российская Федерация", "31448", 0, TODAY);

        assertThat(body).contains("selectedFilterIds=33560_1540283"); // январь
        assertThat(body).contains("selectedFilterIds=33560_1540230"); // декабрь
        assertThat(RosstatEmisProvider.countParts(body, "selectedFilterIds=33560_")).isEqualTo(12);
    }

    @Test
    @DisplayName("isPeriodField: «Период» — да; «Год», «ОКАТО», «Виды товаров» — нет")
    void detectsPeriodField() {
        var filters = RosstatEmisProvider.parseFiltersFromPage(PAGE_HTML);
        assertThat(RosstatEmisProvider.isPeriodField(filters.fields().get("33560"))).isTrue();
        assertThat(RosstatEmisProvider.isPeriodField(filters.fields().get("33"))).isFalse();
        assertThat(RosstatEmisProvider.isPeriodField(filters.fields().get("30"))).isFalse();
        assertThat(RosstatEmisProvider.isPeriodField(filters.fields().get("32"))).isFalse();
        assertThat(RosstatEmisProvider.isPeriodField(new RosstatEmisProvider.EmisField(
                "33560", "Период (месяц)", new java.util.LinkedHashMap<>()))).isTrue();
        assertThat(RosstatEmisProvider.isPeriodField(new RosstatEmisProvider.EmisField(
                "3", "Годы", new java.util.LinkedHashMap<>()))).isFalse();
        assertThat(RosstatEmisProvider.isPeriodField(null)).isFalse();
    }

    @Test
    @DisplayName("recentMonths: окно заканчивается ПРОШЛЫМ месяцем (данные за текущий ещё не вышли)")
    void recentMonthsEndsWithPreviousMonth() {
        assertThat(RosstatEmisProvider.recentMonths(2, LocalDate.of(2026, 10, 28)))
                .containsExactly(9, 8);
        assertThat(RosstatEmisProvider.recentMonths(3, LocalDate.of(2026, 1, 15)))
                .containsExactly(12, 11, 10); // переход через границу года
        assertThat(RosstatEmisProvider.recentMonths(0, LocalDate.of(2026, 10, 28))).isEmpty();
        assertThat(RosstatEmisProvider.recentMonths(50, LocalDate.of(2026, 10, 28))).hasSize(12);
    }

    @Test
    @DisplayName("countParts: счётчики для лога считаются по телу, а не по осям страницы (30611 добавляется fallback-ом)")
    void countsFormPartsFromBuiltBody() {
        var filters = RosstatEmisProvider.parseFiltersFromPage(PAGE_HTML);
        var objects = RosstatEmisProvider.extractObjectIds(PAGE_HTML);
        var token = RosstatEmisProvider.extractStrutsToken(PAGE_HTML);
        String body = RosstatEmisProvider.buildFormBody("Средние потребительские цены на товары и услуги",
                token, objects, filters, "Российская Федерация", "31448", 2, TODAY);

        // Оси со страницы: left_columns ['30'] + groups ['32'] = 2 строки,
        // top_columns ['33','33560'] = 2 колонки
        assertThat(objects.line()).containsExactly("30", "32");
        assertThat(objects.column()).containsExactly("33", "33560");
        // В теле строк БОЛЬШЕ: 30611 не упомянут в осях и добавлен fallback-ом.
        // Именно поэтому лог обязан считать по телу — иначе в журнале lineObjectIds=2 при трёх в запросе.
        assertThat(RosstatEmisProvider.countParts(body, "lineObjectIds=")).isEqualTo(3);
        assertThat(RosstatEmisProvider.countParts(body, "columnObjectIds=")).isEqualTo(2);
        // 0_31448 + 30_1 (только РФ) + 32_101/102/103 + 33_2000…2026 (все 5 лет)
        // + 33560 (2 месяца) + 30611_950351 = 13
        assertThat(RosstatEmisProvider.countParts(body, "selectedFilterIds=")).isEqualTo(13);
        assertThat(RosstatEmisProvider.countParts(body, "filterObjectIds=")).isEqualTo(1);
    }

    @Test
    @DisplayName("pickRegionValue: точное → вхождение → «российская…» → первое")
    void picksRegionValue() {
        var filters = RosstatEmisProvider.parseFiltersFromPage(PAGE_HTML);
        var okato = filters.fields().get("30");
        assertThat(RosstatEmisProvider.pickRegionValue(okato, "Российская Федерация")).isEqualTo("1");
        assertThat(RosstatEmisProvider.pickRegionValue(okato, "Белгородская")).isEqualTo("2");
        assertThat(RosstatEmisProvider.pickRegionValue(okato, "Несуществующий регион")).isEqualTo("1"); // «российск…»
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
     * Дефект №7 (plans/2026-10-28-emis-download-csrf-and-volume): синтетическая фикстура
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
        assertThat(RosstatEmisProvider.monthFromRuName("январь")).isEqualTo(1);
        assertThat(RosstatEmisProvider.monthFromRuName("Февраль")).isEqualTo(2);
        assertThat(RosstatEmisProvider.monthFromRuName("декабря")).isEqualTo(12);
        assertThat(RosstatEmisProvider.monthFromRuName("  МАРТ ")).isEqualTo(3);
        assertThat(RosstatEmisProvider.monthFromRuName("I квартал")).isNull();
        assertThat(RosstatEmisProvider.monthFromRuName(null)).isNull();
    }

    /**
     * Дефект №8: словарь страницы показателя ключуется id значения фильтра, а цены в
     * SDMX — кодом классификатора. Фикстура {@link #PAGE_HTML} эту разницу скрывала:
     * там id значения (101) случайно равен коду классификатора. На боевом ответе
     * (товар «105» отсутствует в словаре страницы) поиск обязан отдать код из выгрузки.
     */
    @Test
    @DisplayName("searchProducts: код категории = код классификатора SDMX, им же находятся цены")
    void searchProductsUsesSdmxClassifierCodes() throws IOException {
        FakeTransport t = new FakeTransport();
        t.dataBody = resource("emis/data-31448-real.xml");
        var provider = provider(t);

        var found = provider.searchProducts("Фарш", 10);

        assertThat(found).hasSize(1);
        assertThat(found.get(0).code()).isEqualTo("105");
        assertThat(found.get(0).name()).isEqualTo("Фарш мясной, кг");
        assertThat(found.get(0).price()).isEqualByComparingTo("557.59");
        assertThat(found.get(0).priceDate()).isEqualTo(LocalDate.of(2026, 4, 1));

        // то же пространство имён: код из поиска находит ряды цен
        assertThat(provider.fetchPrices("105", null)).hasSize(8);
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
        assertThat(RosstatEmisProvider.parsePeriod("2025-09")).isEqualTo(LocalDate.of(2025, 9, 1));
        assertThat(RosstatEmisProvider.parsePeriod("2025-09-15")).isEqualTo(LocalDate.of(2025, 9, 15));
        assertThat(RosstatEmisProvider.parsePeriod("2025M09")).isEqualTo(LocalDate.of(2025, 9, 1));
        assertThat(RosstatEmisProvider.parsePeriod("2025")).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(RosstatEmisProvider.parsePeriod("не период")).isNull();
        assertThat(RosstatEmisProvider.parsePeriod(null)).isNull();
    }

    @Test
    @DisplayName("guessPack: яйца → 10 PCS, молоко → 1 L, остальное → 1 KG")
    void guessesPackUnits() {
        assertThat(RosstatEmisProvider.guessPack("Яйца куриные"))
                .isEqualTo(new RosstatEmisProvider.PackGuess(BigDecimal.TEN, "PCS"));
        assertThat(RosstatEmisProvider.guessPack("Молоко питьевое"))
                .isEqualTo(new RosstatEmisProvider.PackGuess(BigDecimal.ONE, "L"));
        assertThat(RosstatEmisProvider.guessPack("Гречневая крупа"))
                .isEqualTo(new RosstatEmisProvider.PackGuess(BigDecimal.ONE, "KG"));
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
    @DisplayName("searchProducts: Fix-14 — фильтр по подстроке, pack-эвристика И свежая цена категории из выгрузки")
    void searchProductsReturnsPrice() {
        FakeTransport t = new FakeTransport();
        var p = provider(t);

        List<ExternalProductDto> found = p.searchProducts("греч", 20);
        assertThat(found).hasSize(1);
        var product = found.get(0);
        assertThat(product.code()).isEqualTo("101");
        assertThat(product.name()).isEqualTo("Гречневая крупа");
        assertThat(product.brand()).isEqualTo("Росстат");
        assertThat(product.packAmount()).isEqualByComparingTo("1");
        assertThat(product.packUnit()).isEqualTo("KG");
        // Fix-14: цена подтянута из SDMX (РФ, последний месяц 2025-09 = 89.1)
        assertThat(product.price()).isEqualByComparingTo("89.1");
        assertThat(product.priceDate()).isEqualTo(LocalDate.of(2025, 9, 1));

        // Яйца — pack 10 PCS; в SDMX-фикстуре нет ряда для 103 → цена null (не падаем)
        var eggs = p.searchProducts("яйц", 20);
        assertThat(eggs).hasSize(1);
        assertThat(eggs.get(0).packAmount()).isEqualByComparingTo("10");
        assertThat(eggs.get(0).packUnit()).isEqualTo("PCS");
        assertThat(eggs.get(0).price()).isNull();

        // Выгрузка закэширована: повторный поиск не идёт в сеть заново
        int postsAfterFirst = t.posts;
        assertThat(postsAfterFirst).isEqualTo(1);
        p.searchProducts("молоко", 20);
        assertThat(t.posts).isEqualTo(postsAfterFirst);

        // Пустой запрос — ВЕСЬ словарный справочник страницы (3 категории, включая
        // 103 без ценового ряда — список не урезается до «только те, у кого есть цена»)
        assertThat(p.searchProducts("", 50)).hasSize(3);
    }

    @Test
    @DisplayName("searchProducts: Fix-14 — выгрузка цен недоступна → graceful-fallback на справочник без цен")
    void searchProductsFallbackWithoutPrices() {
        FakeTransport t = new FakeTransport();
        t.dataStatus = 500; // SDMX-выгрузка падает, но страница показателя (GET) доступна
        var p = provider(t);

        List<ExternalProductDto> found = p.searchProducts("греч", 20);
        assertThat(found).hasSize(1);
        assertThat(found.get(0).code()).isEqualTo("101");
        assertThat(found.get(0).name()).isEqualTo("Гречневая крупа");
        // Поиск работает, но без цены (выгрузка недоступна)
        assertThat(found.get(0).price()).isNull();
        assertThat(found.get(0).priceDate()).isNull();
    }

    @Test
    @DisplayName("fetchPrices: полная выгрузка SDMX, POST-тело с токеном, цены RUB по месяцам, фильтр since")
    void fetchPricesFullPipeline() {
        FakeTransport t = new FakeTransport();
        var p = provider(t);

        List<ExternalPriceDto> prices = p.fetchPrices("101", null);
        assertThat(t.posts).isEqualTo(1);
        // CSRF-токен уходит в поле с именем, прочитанным со страницы, и запрос содержит id показателя
        assertThat(t.lastFormBody).contains("struts.token.name=token");
        assertThat(t.lastFormBody).contains("token=TOKEN123");
        assertThat(t.lastFormBody).contains("id=31448");
        assertThat(t.lastFormBody).doesNotContain("struts.token=TOKEN123");
        assertThat(prices).hasSize(2);
        assertThat(prices.get(0).code()).isEqualTo("101");
        assertThat(prices.get(0).currency()).isEqualTo("RUB");
        assertThat(prices.get(0).price()).isEqualByComparingTo("87.4");
        assertThat(prices.get(0).date()).isEqualTo(LocalDate.of(2025, 8, 1));

        // since отсекает ранние точки
        assertThat(p.fetchPrices("101", LocalDate.of(2025, 9, 1))).hasSize(1);
        // неизвестная категория — пусто, без ошибки
        assertThat(p.fetchPrices("999", null)).isEmpty();
        // кэш: вторая серия вызовов не идёт в сеть
        int postsBefore = t.posts;
        p.fetchPrices("102", null);
        assertThat(t.posts).isEqualTo(postsBefore);
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

        assertThatThrownBy(() -> p.fetchPrices("101", null))
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

        assertThatThrownBy(() -> p.fetchPrices("101", null))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("302")
                .hasMessageContaining("/indicator/31448.do")
                .hasMessageContaining("фильтр")
                .hasMessageNotContaining("истёк");
    }

    @Test
    @DisplayName("Сбой сети при ЖИВОМ кэше → отдаём предыдущие данные (graceful degradation)")
    void staleCacheOnFailure() {
        FakeTransport t = new FakeTransport();
        var p = provider(t);
        assertThat(p.fetchPrices("101", null)).hasSize(2); // прогрели кэш

        t.ioFailure = true; // сеть упала, TTL не истёк — но даже при истечении:
        var cached = p.fetchPrices("101", null);
        assertThat(cached).hasSize(2); // свежий кэш отдаётся без сети

        // Прогоняем TTL: новый провайдер с нулевым кэшем и упавшей сетью → ошибка
        FakeTransport dead = new FakeTransport();
        dead.ioFailure = true;
        var p2 = new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", Duration.ofHours(24), 2, dead);
        assertThatThrownBy(() -> p2.fetchPrices("101", null))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("недоступен");
    }

    @Test
    @DisplayName("looksLikeHtml: распознаёт HTML-ошибку, не трогает XML")
    void detectsHtmlPayload() {
        assertThat(RosstatEmisProvider.looksLikeHtml("<!DOCTYPE html><html>")).isTrue();
        assertThat(RosstatEmisProvider.looksLikeHtml("  <html lang='ru'>")).isTrue();
        assertThat(RosstatEmisProvider.looksLikeHtml(SDMX_XML)).isFalse();
    }

    @Test
    @DisplayName("extractBalanced: строки со скобками внутри не ломают балансировку")
    void balancedExtractionWithStrings() {
        String text = "filters: { 'a': { title: 'Виды {не поле}', values: {} } } хвост";
        String block = RosstatEmisProvider.extractBalanced(text, "filters:", '{');
        assertThat(block).isEqualTo("{ 'a': { title: 'Виды {не поле}', values: {} } }");
    }
}
