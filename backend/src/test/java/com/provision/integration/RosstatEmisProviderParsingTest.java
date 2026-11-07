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
 * Fix-13: разбор SDMX (GenericData: CodeLists + Series/Obs), имена месяцев,
 * периоды и ручная загрузка выгрузки файлом (parseSnapshot, KB-1).
 */
@DisplayName("RosstatEmisProvider: разбор SDMX-выгрузки")
class RosstatEmisProviderParsingTest {

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

    @Test
    @DisplayName("looksLikeHtml: распознаёт HTML-ошибку, не трогает XML")
    void detectsHtmlPayload() {
        assertThat(EmisTransport.looksLikeHtml("<!DOCTYPE html><html>")).isTrue();
        assertThat(EmisTransport.looksLikeHtml("  <html lang='ru'>")).isTrue();
        assertThat(EmisTransport.looksLikeHtml(SDMX_XML)).isFalse();
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
}
