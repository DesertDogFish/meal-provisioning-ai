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

    /** Фикстура страницы показателя: токен + JS-словарь фильтров + оси. */
    static final String PAGE_HTML = """
            <html><head><title>Средние потребительские цены на товары и услуги — ЕМИСС</title></head>
            <body>
            <div id="downloadTokenHolder">
              <input type="hidden" name="struts.token.name" value="struts.token">
              <input type="hidden" name="struts.token" value="TOKEN123">
            </div>
            <script type="text/javascript">
            var grid = {
              filters: {
                '0': { title: 'Средние потребительские цены', values: { '31448': { title: 'Средние потребительские цены на товары и услуги' } } },
                '30': { title: 'Классификатор объектов административно-территориального деления (ОКАТО)', values: { '1': { title: 'Российская Федерация' }, '2': { title: 'Белгородская область' } } },
                '32': { title: 'Виды товаров и услуг', values: { '101': { title: 'Гречневая крупа' }, '102': { title: 'Молоко питьевое' }, '103': { title: 'Яйца куриные' } } },
                '33': { title: 'Период', values: { '2024': { title: '2024' }, '2025': { title: '2025' } } }
              },
              left_columns: ['30'],
              top_columns: ['33'],
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
                    return new RosstatEmisProvider.PageResult(dataStatus, dataBody);
                }

                @Override
                public void close() { }
            };
        }
    }

    private static RosstatEmisProvider provider(FakeTransport t) {
        return new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", Duration.ofHours(24), t);
    }

    // ==================== Чистые функции парсинга ====================

    @Test
    @DisplayName("extractStrutsToken: одноразовый CSRF из div#downloadTokenHolder")
    void extractsStrutsToken() {
        var token = RosstatEmisProvider.extractStrutsToken(PAGE_HTML);
        assertThat(token).isNotNull();
        assertThat(token.name()).isEqualTo("struts.token");
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
        String html = """
                <html><body>
                <form action="/indicator/downloadData.do" method="post">
                  <input type="hidden" name="struts.token.name" value="struts.token"/>
                  <input type="hidden" name="struts.token" value="TOKEN-NOHOLDER"/>
                </form>
                </body></html>
                """;
        var token = RosstatEmisProvider.extractStrutsToken(html);
        assertThat(token).isNotNull();
        assertThat(token.name()).isEqualTo("struts.token");
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
        assertThat(objects.column()).containsExactly("33");
    }

    @Test
    @DisplayName("buildFormBody: токен, регион РФ (не все), товары/периоды целиком, filterObjectIds=0")
    void buildsFormBody() {
        var filters = RosstatEmisProvider.parseFiltersFromPage(PAGE_HTML);
        var objects = RosstatEmisProvider.extractObjectIds(PAGE_HTML);
        var token = RosstatEmisProvider.extractStrutsToken(PAGE_HTML);
        String body = RosstatEmisProvider.buildFormBody("Средние потребительские цены на товары и услуги",
                token, objects, filters, "Российская Федерация", "31448");

        assertThat(body).contains("struts.token.name=struts.token");
        assertThat(body).contains("struts.token=TOKEN123");
        // Регион: выбран ТОЛЬКО код РФ (1), не Белгородская область (2)
        assertThat(body).contains("selectedFilterIds=30_1");
        assertThat(body).doesNotContain("selectedFilterIds=30_2");
        // Товары и периоды: все значения (полный ряд режем на своей стороне)
        assertThat(body).contains("selectedFilterIds=32_101");
        assertThat(body).contains("selectedFilterIds=32_102");
        assertThat(body).contains("selectedFilterIds=32_103");
        assertThat(body).contains("selectedFilterIds=33_2024");
        assertThat(body).contains("selectedFilterIds=33_2025");
        // Поле «0» (сам показатель) — selected + filterObjectIds (вне осей)
        assertThat(body).contains("selectedFilterIds=0_31448");
        assertThat(body).contains("filterObjectIds=0");
        // Оси: 30 (left) и 32 (groups) — строки; 33 (top) — колонки; «0» не в осях
        assertThat(body).contains("lineObjectIds=30");
        assertThat(body).contains("lineObjectIds=32");
        assertThat(body).contains("columnObjectIds=33");
        assertThat(body).doesNotContain("lineObjectIds=0");
        assertThat(body).doesNotContain("columnObjectIds=0");
        // Кириллический title — URL-encoded
        assertThat(body).startsWith("title=%D0%A1%D1%80%D0%B5%D0%B4%D0%BD%D0%B8%D0%B5");
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
        assertThat(t.lastFormBody).contains("struts.token=TOKEN123");
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
    @DisplayName("HTML вместо SDMX → IntegrationUnavailableException про одноразовый токен")
    void htmlInsteadOfSdmx() {
        FakeTransport t = new FakeTransport();
        t.dataBody = "<!DOCTYPE html><html><body>CSRF check failed</body></html>";
        var p = provider(t);
        assertThatThrownBy(() -> p.fetchPrices("101", null))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("CSRF");
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
                "Российская Федерация", Duration.ofHours(24), dead);
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
