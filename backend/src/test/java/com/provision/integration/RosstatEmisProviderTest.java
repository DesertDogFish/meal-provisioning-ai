package com.provision.integration;

import com.provision.exception.IntegrationUnavailableException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import static com.provision.integration.RosstatTestFixtures.*;

/**
 * Fix-13: юнит-тесты RosstatEmisProvider (ЕМИСС/fedstat.ru) — токен, фильтры,
 * построение формы POST downloadData.do. Фикстуры — RosstatTestFixtures.
 * Разбито по R8 из монолита 845 строк.
 */
@DisplayName("RosstatEmisProvider: протокол ЕМИСС (токен, фильтры, форма запроса)")
class RosstatEmisProviderTest {

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

    // ==================== Поведение провайдера (fake transport) ====================

    @Test
    @DisplayName("code() = ROSSTAT (RecipeSource.valueOf(\"ROSSTAT\") обязан существовать)")
    void codeIsRosstat() {
        assertThat(provider(new FakeTransport()).code()).isEqualTo("ROSSTAT");
        assertThat(com.provision.entity.RecipeSource.valueOf("ROSSTAT")).isNotNull();
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

    @Test
    @DisplayName("AU-05 parseSnapshot(InputStream): переразмер виден по declared-размеру — поток не читается вовсе")
    void rejectsOversizedStreamBeforeReadingIt() {
        var p = new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", 2, 1024L, new FakeTransport());
        CountingStream payload = new CountingStream(new byte[4096]);

        assertThatThrownBy(() -> p.parseSnapshot(payload, 2048L, "big.xml"))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("2048 байт")
                .hasMessageContaining("превышает предел max-response-bytes=1024");
        // Собственно защита от OOM: отказ случился до первого read(), ни байта не прочитано.
        assertThat(payload.reads).hasValue(0);
    }

    @Test
    @DisplayName("AU-05 parseSnapshot(InputStream): declared-размер врёт — разбор обрывается на пределе, а не съедает файл")
    void abortsRunawayStreamThatIsLargerThanDeclared() throws IOException {
        // Multipart-заголовок и фактический размер могут расходиться (обрыв сети, подделанный
        // запрос). Предел по declared-размеру в этом случае не срабатывает, поэтому второй
        // рубеж — LimitedInputStream внутри SdmxStreamParser: читаем не больше max-response-bytes.
        var p = new RosstatEmisProvider("https://www.fedstat.ru", "31448",
                "Российская Федерация", 2, 1024L, new FakeTransport());
        byte[] real = resourceBytes("emis/data-31448-real.xml");
        assertThat(real.length).isGreaterThan(1024);

        assertThatThrownBy(() -> p.parseSnapshot(
                new ByteArrayInputStream(real), 10L, "lies-about-size.xml"))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("больше 1024 байт")
                .hasMessageContaining("чтение оборвано");
    }

    @Test
    @DisplayName("AU-05 parseSnapshot(InputStream): обрыв потока — IntegrationUnavailable, а не стектрейс StAX")
    void reportsBrokenStreamAsIntegrationUnavailable() {
        CountingStream payload = new CountingStream(new byte[8192]);
        payload.failOnRead = true;

        assertThatThrownBy(() -> provider(new FakeTransport())
                .parseSnapshot(payload, 8192L, "truncated.xml"))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("truncated.xml")
                .hasMessageContaining("не удалось прочитать")
                .hasMessageContaining("Connection reset");
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
}
