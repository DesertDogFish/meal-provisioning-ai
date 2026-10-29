package com.provision.integration;

import com.provision.exception.IntegrationUnavailableException;
import com.provision.integration.EmisSnapshot.PricePoint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Потоковый разбор SDMX ({@link SdmxStreamParser}, план
 * {@code plans/done/2026-10-29-sdmx-stax-streaming.md}, дефект KB-1).
 *
 * <p>Что здесь закреплено, кроме «просто работает»:</p>
 * <ul>
 *   <li><b>golden-значения боевой фикстуры</b> {@code emis/data-31448-real.xml} — те же, что
 *       asserting в {@code RosstatEmisProviderTest}: результат разбора обязан был остаться
 *       прежним при замене DOM на StAX (критерий приёмки подзадачи 1);</li>
 *   <li>обе формы SDMX: боевая 1.0 (год в {@code Obs/Time}, месяц — атрибут ряда
 *       {@code PERIOD}) и синтетическая 2.1 ({@code ObsDimension});</li>
 *   <li>предохранители потокового чтения: обрыв по {@code maxBytes}, запрет DTD/внешних
 *       сущностей (XXE), потолок буфера «ряды раньше словарей»;</li>
 *   <li>объём: документ, заметно больший фикстур, разбирается с правильными счётчиками
 *       (память при этом не растёт пропорционально объёму — доказано прогоном харнеса на
 *       66,2 МБ при {@code -Xmx128m}, см. «Результаты» плана).</li>
 * </ul>
 */
@DisplayName("SdmxStreamParser: потоковый разбор SDMX (StAX) вместо DOM")
class SdmxStreamParserTest {

    private static final String RF = "Российская Федерация";

    // ==================== Боевая фикстура ====================

    @Test
    @DisplayName("Боевая фикстура SDMX 1.0: каталог 4 позиции, регион 643, 8 точек фарша (golden)")
    void parsesRealFixtureWithGoldenValues() throws IOException {
        String xml = resource("emis/data-31448-real.xml");

        EmisSnapshot snap = parse(xml, RF);

        // Регион — точное совпадение заголовка в словаре ОКАТО: «643», а не «643004.АГ».
        assertThat(snap.regionCode()).isEqualTo("643");
        // Каталог — ПОЛНЫЙ словарь номенклатуры из CodeList, включая позиции без рядов.
        assertThat(snap.catalog())
                .hasSize(4)
                .containsEntry("105", "Фарш мясной, кг")
                .containsEntry("2703", "Апельсины, кг");
        // Ряды регионов «643004.АГ» и «030» отброшены, товары без рядов не появляются.
        assertThat(snap.prices()).containsOnlyKeys("105");

        List<PricePoint> mince = snap.prices().get("105");
        assertThat(mince).hasSize(8); // 2 года × 4 месяца, отсортировано по дате
        assertThat(mince.get(0).date()).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(mince.get(0).price()).isEqualByComparingTo("502.55"); // «502,55» → 502.55
        assertThat(mince.get(7).date()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(mince.get(7).price()).isEqualByComparingTo("557.59");
    }

    @Test
    @DisplayName("Обёртка RosstatEmisProvider.parseSdmx(String) даёт тот же слепок, что поток")
    void stringWrapperIsEquivalentToStream() throws IOException {
        String xml = resource("emis/data-31448-real.xml");

        EmisSnapshot stream = parse(xml, RF);
        EmisSnapshot viaString = RosstatEmisProvider.parseSdmx(xml, RF);

        assertThat(viaString.regionCode()).isEqualTo(stream.regionCode());
        assertThat(viaString.catalog()).isEqualTo(stream.catalog());
        assertThat(viaString.prices()).isEqualTo(stream.prices());
    }

    // ==================== Формы SDMX ====================

    @Test
    @DisplayName("SDMX 2.1: время из ObsDimension, значение из ObsValue")
    void parsesSdmx21Shape() {
        String xml = doc("""
                <CodeLists>
                 <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                  <structure:Code value="1">Российская Федерация</structure:Code>
                  <structure:Code value="2">Белгородская область</structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                  <structure:Code value="101">Гречневая крупа</structure:Code>
                 </structure:CodeList>
                </CodeLists>
                <DataSet>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="1"/>
                   <generic:Value concept="32" value="101"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:ObsDimension value="2025-08"/><generic:ObsValue value="87.4"/></generic:Obs>
                  <generic:Obs><generic:ObsDimension value="2025-09"/><generic:ObsValue value="89,1"/></generic:Obs>
                 </generic:Series>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="2"/>
                   <generic:Value concept="32" value="101"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:ObsDimension value="2025-09"/><generic:ObsValue value="80.0"/></generic:Obs>
                 </generic:Series>
                </DataSet>""");

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.regionCode()).isEqualTo("1");
        assertThat(snap.prices()).containsOnlyKeys("101");
        assertThat(snap.prices().get("101")).containsExactly(
                new PricePoint(LocalDate.of(2025, 8, 1), new BigDecimal("87.4")),
                new PricePoint(LocalDate.of(2025, 9, 1), new BigDecimal("89.1")));
    }

    @Test
    @DisplayName("SDMX 1.0: год из Obs/Time + месяц из атрибута ряда PERIOD")
    void parsesRealSdmx10Shape() {
        String xml = doc("""
                <CodeLists>
                 <structure:CodeList id="s_OKATO"><structure:Name>Классификатор ОКАТО</structure:Name>
                  <structure:Code value="643"><structure:Description>Российская Федерация</structure:Description></structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="s_grtov"><structure:Name>Виды товаров и услуг</structure:Name>
                  <structure:Code value="105"><structure:Description>Фарш мясной, кг</structure:Description></structure:Code>
                 </structure:CodeList>
                </CodeLists>
                <DataSet>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="s_OKATO" value="643"/>
                   <generic:Value concept="s_grtov" value="105"/>
                  </generic:SeriesKey>
                  <generic:Attributes><generic:Value concept="PERIOD" value="март"/></generic:Attributes>
                  <generic:Obs><generic:Time>2026</generic:Time><generic:ObsValue value="557,59"/></generic:Obs>
                 </generic:Series>
                </DataSet>""");

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.prices().get("105")).containsExactly(
                new PricePoint(LocalDate.of(2026, 3, 1), new BigDecimal("557.59")));
    }

    @Test
    @DisplayName("Годовой ряд без месяца: 1 января (дефект №7 закрытого плана не регрессирует)")
    void yearlySeriesWithoutMonthGivesFirstOfJanuary() {
        String xml = doc("""
                <CodeLists>
                 <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                  <structure:Code value="643">Российская Федерация</structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                  <structure:Code value="105">Фарш мясной, кг</structure:Code>
                 </structure:CodeList>
                </CodeLists>
                <DataSet>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="643"/>
                   <generic:Value concept="32" value="105"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:Time>2025</generic:Time><generic:ObsValue value="502,55"/></generic:Obs>
                 </generic:Series>
                </DataSet>""");

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.prices().get("105")).containsExactly(
                new PricePoint(LocalDate.of(2025, 1, 1), new BigDecimal("502.55")));
    }

    @Test
    @DisplayName("Текст узла — конкатенация потомков (паритет DOM getTextContent)")
    void nodeTextConcatenatesDescendants() {
        String xml = doc("""
                <CodeLists>
                 <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                  <structure:Code value="643">Российская <b>Федерация</b></structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                  <structure:Code value="105"><structure:Description>Фарш <i>мясной</i>, кг</structure:Description></structure:Code>
                 </structure:CodeList>
                </CodeLists>
                <DataSet/>""");

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.catalog()).containsEntry("105", "Фарш мясной, кг");
        assertThat(snap.regionCode()).isEqualTo("643");
    }

    // ==================== Фильтрация и отбраковка ====================

    @Test
    @DisplayName("Виды показателя: ряды без «цен» в заголовке отбрасываются")
    void keepsOnlyPriceSeriesWhenTypeDimensionExists() {
        String xml = doc("""
                <CodeLists>
                 <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                  <structure:Code value="643">Российская Федерация</structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                  <structure:Code value="105">Фарш мясной, кг</structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="34"><structure:Name>Виды показателя</structure:Name>
                  <structure:Code value="1">Средние потребительские цены</structure:Code>
                  <structure:Code value="2">Объём производства</structure:Code>
                 </structure:CodeList>
                </CodeLists>
                <DataSet>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="643"/>
                   <generic:Value concept="32" value="105"/>
                   <generic:Value concept="34" value="2"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:Time>2025-08</generic:Time><generic:ObsValue value="999"/></generic:Obs>
                 </generic:Series>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="643"/>
                   <generic:Value concept="32" value="105"/>
                   <generic:Value concept="34" value="1"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:Time>2025-08</generic:Time><generic:ObsValue value="502,55"/></generic:Obs>
                 </generic:Series>
                </DataSet>""");

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.prices().get("105")).containsExactly(
                new PricePoint(LocalDate.of(2025, 8, 1), new BigDecimal("502.55")));
    }

    @Test
    @DisplayName("Наблюдения без цены, с нулём/минусом и без даты отбрасываются, ряд сортируется")
    void dropsGarbageObservationsAndSortsByDate() {
        String xml = doc("""
                <CodeLists>
                 <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                  <structure:Code value="643">Российская Федерация</structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                  <structure:Code value="105">Фарш мясной, кг</structure:Code>
                 </structure:CodeList>
                </CodeLists>
                <DataSet>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="643"/>
                   <generic:Value concept="32" value="105"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:Time>2026-02</generic:Time><generic:ObsValue value="0"/></generic:Obs>
                  <generic:Obs><generic:Time>2026-03</generic:Time><generic:ObsValue value="-12,5"/></generic:Obs>
                  <generic:Obs><generic:Time>2026-04</generic:Time><generic:ObsValue value="н/д"/></generic:Obs>
                  <generic:Obs><generic:Time>2026-05</generic:Time></generic:Obs>
                  <generic:Obs><generic:Time>не дата</generic:Time><generic:ObsValue value="10"/></generic:Obs>
                 </generic:Series>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="643"/>
                   <generic:Value concept="32" value="105"/>
                  </generic:SeriesKey>
                  <generic:Attributes><generic:Value concept="PERIOD" value="январь"/></generic:Attributes>
                  <generic:Obs><generic:Time>2026</generic:Time><generic:ObsValue value="510"/></generic:Obs>
                 </generic:Series>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="643"/>
                   <generic:Value concept="32" value="105"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:Time>2025-12</generic:Time><generic:ObsValue value="500"/></generic:Obs>
                 </generic:Series>
                </DataSet>""");

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.prices().get("105")).containsExactly(
                new PricePoint(LocalDate.of(2025, 12, 1), new BigDecimal("500")),
                new PricePoint(LocalDate.of(2026, 1, 1), new BigDecimal("510")));
    }

    @Test
    @DisplayName("Ряд чужого региона отбрасывается, регион берётся из конфига")
    void filtersSeriesByConfiguredRegion() {
        String xml = doc("""
                <CodeLists>
                 <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                  <structure:Code value="643">Российская Федерация</structure:Code>
                  <structure:Code value="030">Центральный федеральный округ</structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                  <structure:Code value="105">Фарш мясной, кг</structure:Code>
                 </structure:CodeList>
                </CodeLists>
                <DataSet>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="030"/>
                   <generic:Value concept="32" value="105"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:Time>2026-01</generic:Time><generic:ObsValue value="700"/></generic:Obs>
                 </generic:Series>
                </DataSet>""");

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.regionCode()).isEqualTo("643");
        assertThat(snap.prices()).isEmpty();
        assertThat(snap.catalog()).containsKey("105"); // справочник полон независимо от рядов
    }

    @Test
    @DisplayName("Без словаря товаров — внятная ошибка, а не пустой слепок")
    void failsWhenProductDimensionIsMissing() {
        String xml = doc("""
                <CodeLists>
                 <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                  <structure:Code value="643">Российская Федерация</structure:Code>
                 </structure:CodeList>
                </CodeLists>
                <DataSet/>""");

        assertThatThrownBy(() -> parse(xml, RF))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("не найдено измерение товаров");
    }

    // ==================== Предохранители потокового чтения ====================

    @Test
    @DisplayName("maxBytes обрывает ЧТЕНИЕ: сообщение называет лимит и чем его поднять")
    void abortsReadingWhenByteLimitExceeded() {
        String xml = bigDoc(200, 12, "643");

        assertThatThrownBy(() -> parse(xml, RF, 4096L))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("больше 4096 байт")
                .hasMessageContaining("чтение оборвано")
                .hasMessageContaining("ROSSTAT_MAX_RESPONSE_BYTES");
    }

    @Test
    @DisplayName("maxBytes = 0 — без ограничения: тот же документ разбирается целиком")
    void zeroLimitMeansUnlimited() {
        String xml = bigDoc(200, 12, "643");

        EmisSnapshot snap = parse(xml, RF, 0L);

        assertThat(snap.catalog()).hasSize(200);
        assertThat(snap.prices()).hasSize(200);
        assertThat(snap.prices().values().stream().mapToInt(List::size).sum()).isEqualTo(200 * 12);
    }

    @Test
    @DisplayName("XXE: DTD и внешние сущности запрещены, содержимое файла не читается")
    void rejectsDtdAndExternalEntities(@TempDir Path dir) throws IOException {
        Path secret = dir.resolve("secret.txt");
        Files.writeString(secret, "СЕКРЕТ-АДМИНА");
        String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<!DOCTYPE GenericData [<!ENTITY xxe SYSTEM \"" + secret.toUri() + "\">]>"
                + "<GenericData><CodeLists>&xxe;</CodeLists></GenericData>";

        assertThatThrownBy(() -> parse(xml, RF))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("SDMX-ответ не распознан");
    }

    @Test
    @DisplayName("Ряды раньше словарей буферизуются и разбираются (в боевом ответе так не бывает)")
    void buffersSeriesThatPrecedeCodeLists() {
        String xml = doc("""
                <DataSet>
                 <generic:Series>
                  <generic:SeriesKey>
                   <generic:Value concept="30" value="643"/>
                   <generic:Value concept="32" value="105"/>
                  </generic:SeriesKey>
                  <generic:Obs><generic:Time>2026-01</generic:Time><generic:ObsValue value="510"/></generic:Obs>
                 </generic:Series>
                </DataSet>
                <CodeLists>
                 <structure:CodeList id="30"><structure:Name>ОКАТО</structure:Name>
                  <structure:Code value="643">Российская Федерация</structure:Code>
                 </structure:CodeList>
                 <structure:CodeList id="32"><structure:Name>Виды товаров и услуг</structure:Name>
                  <structure:Code value="105">Фарш мясной, кг</structure:Code>
                 </structure:CodeList>
                </CodeLists>""");

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.prices().get("105")).containsExactly(
                new PricePoint(LocalDate.of(2026, 1, 1), new BigDecimal("510")));
    }

    @Test
    @DisplayName("Больше 10 000 рядов до словарей — разбор прерывается, а не съедает heap")
    void failsWhenTooManySeriesPrecedeCodeLists() {
        StringBuilder sb = new StringBuilder(2_000_000);
        sb.append(docOpen()).append("<DataSet>");
        for (int i = 0; i < 10_001; i++) {
            sb.append("<generic:Series><generic:SeriesKey>")
              .append("<generic:Value concept=\"30\" value=\"643\"/>")
              .append("<generic:Value concept=\"32\" value=\"").append(i).append("\"/>")
              .append("</generic:SeriesKey></generic:Series>");
        }
        sb.append("</DataSet></GenericData>");

        assertThatThrownBy(() -> parse(sb.toString(), RF))
                .isInstanceOf(IntegrationUnavailableException.class)
                .hasMessageContaining("ряды идут раньше словарей");
    }

    // ==================== Объём ====================

    @Test
    @DisplayName("Большой документ (1200 позиций × 2 региона × 12 месяцев) разбирается с верными счётчиками")
    void parsesLargeDocumentWithCorrectCounters() {
        String xml = bigDocWithSecondRegion(1200, 12);

        EmisSnapshot snap = parse(xml, RF);

        assertThat(snap.catalog()).hasSize(1200);
        assertThat(snap.regionCode()).isEqualTo("643");
        assertThat(snap.prices()).hasSize(1200);
        assertThat(snap.prices().values().stream().mapToInt(List::size).sum())
                .isEqualTo(1200 * 12); // ряды второго региона (030) отброшены
        assertThat(snap.prices().get("105")).hasSize(12);
        assertThat(snap.prices().get("105").get(0).date()).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(snap.prices().get("105").get(11).date()).isEqualTo(LocalDate.of(2025, 12, 1));
    }

    // ==================== помощники ====================

    private static EmisSnapshot parse(String xml, String regionTitle) {
        return parse(xml, regionTitle, 0L);
    }

    private static EmisSnapshot parse(String xml, String regionTitle, long maxBytes) {
        try (InputStream in = new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8))) {
            return SdmxStreamParser.parse(in, regionTitle, maxBytes);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String resource(String path) throws IOException {
        try (InputStream in = SdmxStreamParserTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IOException("нет тестового ресурса: " + path);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String docOpen() {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <GenericData xmlns="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/message"
                             xmlns:generic="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/generic"
                             xmlns:structure="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/structure">
                """;
    }

    /** Обёртка тела документа в {@code GenericData} с пространствами имён боевого ответа. */
    private static String doc(String body) {
        return docOpen() + body + "\n</GenericData>";
    }

    /** Один регион, {@code goods} позиций справочника, по {@code months} месяцев 2025 года. */
    private static String bigDoc(int goods, int months, String regionCode) {
        StringBuilder sb = new StringBuilder(goods * months * 200);
        sb.append(docOpen()).append("<CodeLists>");
        sb.append(codelist("30", "ОКАТО", List.of(regionCode + "|Российская Федерация")));
        List<String> items = new ArrayList<>();
        for (int i = 0; i < goods; i++) {
            items.add(code(105 + i) + "|Товар " + i + ", кг");
        }
        sb.append(codelist("32", "Виды товаров и услуг", items));
        sb.append("</CodeLists><DataSet>");
        for (int i = 0; i < goods; i++) {
            sb.append(series(regionCode, String.valueOf(105 + i), months));
        }
        sb.append("</DataSet></GenericData>");
        return sb.toString();
    }

    /** То же, но каждый товар продублирован рядом чужого региона («030»). */
    private static String bigDocWithSecondRegion(int goods, int months) {
        StringBuilder sb = new StringBuilder(goods * months * 400);
        sb.append(docOpen()).append("<CodeLists>");
        sb.append(codelist("30", "ОКАТО",
                List.of("643|Российская Федерация", "030|Центральный федеральный округ")));
        List<String> items = new ArrayList<>();
        for (int i = 0; i < goods; i++) {
            items.add(code(105 + i) + "|Товар " + i + ", кг");
        }
        sb.append(codelist("32", "Виды товаров и услуг", items));
        sb.append("</CodeLists><DataSet>");
        for (int i = 0; i < goods; i++) {
            sb.append(series("643", String.valueOf(105 + i), months));
            sb.append(series("030", String.valueOf(105 + i), months));
        }
        sb.append("</DataSet></GenericData>");
        return sb.toString();
    }

    /** Код справочника; {@code value} — строка, чтобы значения не сливались после 1000. */
    private static String code(int value) {
        return String.valueOf(value);
    }

    private static String codelist(String id, String title, List<String> values) {
        StringBuilder sb = new StringBuilder();
        sb.append("<structure:CodeList id=\"").append(id).append("\">")
          .append("<structure:Name xml:lang=\"ru\">").append(title).append("</structure:Name>");
        for (String v : values) {
            int sep = v.indexOf('|');
            sb.append("<structure:Code value=\"").append(v, 0, sep).append("\">")
              .append("<structure:Description xml:lang=\"ru\">").append(v.substring(sep + 1))
              .append("</structure:Description></structure:Code>");
        }
        return sb.append("</structure:CodeList>").toString();
    }

    /** Ряд боевой формы: месяц — атрибут PERIOD, год — в {@code Obs/Time}. */
    private static String series(String regionCode, String goodsCode, int months) {
        StringBuilder sb = new StringBuilder();
        for (int m = 1; m <= months; m++) {
            sb.append("<generic:Series><generic:SeriesKey>")
              .append("<generic:Value concept=\"30\" value=\"").append(regionCode).append("\"/>")
              .append("<generic:Value concept=\"32\" value=\"").append(goodsCode).append("\"/>")
              .append("</generic:SeriesKey>")
              .append("<generic:Attributes><generic:Value concept=\"PERIOD\" value=\"")
              .append(monthName(m)).append("\"/></generic:Attributes>")
              .append("<generic:Obs><generic:Time>2025</generic:Time>")
              .append("<generic:ObsValue value=\"").append(100 + m).append(",50\"/></generic:Obs>")
              .append("</generic:Series>");
        }
        return sb.toString();
    }

    private static String monthName(int month) {
        return List.of("январь", "февраль", "март", "апрель", "май", "июнь",
                "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь").get(month - 1);
    }
}
