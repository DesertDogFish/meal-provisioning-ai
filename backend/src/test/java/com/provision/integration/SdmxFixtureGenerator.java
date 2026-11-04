package com.provision.integration;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * BL-24: генератор большой SDMX-фикстуры прямо в файл (без материализации строки в heap).
 *
 * <p>Структура совпадает с боевым ответом ЕМИСС (SDMX 1.0): {@code CodeLists} (ОКАТО + товары)
 * и {@code DataSet} (по одному {@code generic:Series} на месяц каждой позиции). Пишется
 * потоково в {@link BufferedWriter}, поэтому генерация 60+ МБ не требует 60 МБ в heap —
 * именно это позволяет отдельно замерить память самого разбора.</p>
 *
 * <p>Обычный {@code mvn test} этот генератор не использует: бенчмарк
 * {@code SdmxStreamParserTest#bigDocumentMemoryBenchmark} включается только с
 * {@code -Dbenchmark.sdmx=true}.</p>
 */
public final class SdmxFixtureGenerator {

    private SdmxFixtureGenerator() {
    }

    /**
     * Сгенерировать документ в файл.
     *
     * @param target     путь к файлу (перезаписывается)
     * @param goods      число позиций справочника
     * @param months     число месяцев на позицию (ряды 2025 года)
     * @param regionCode код ОКАТО региона
     */
    public static void generate(Path target, int goods, int months, String regionCode) throws IOException {
        try (BufferedWriter w = Files.newBufferedWriter(target, StandardCharsets.UTF_8)) {
            writeDocOpen(w);
            writeCodeLists(w, goods, regionCode);
            writeDataSet(w, goods, months, regionCode);
            w.write("</GenericData>");
        }
    }

    private static void writeDocOpen(Writer w) throws IOException {
        w.write("""
                <?xml version="1.0" encoding="UTF-8"?>
                <GenericData xmlns="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/message"
                             xmlns:generic="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/generic"
                             xmlns:structure="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/structure">
                """);
    }

    private static void writeCodeLists(Writer w, int goods, String regionCode) throws IOException {
        w.write("<CodeLists>");
        w.write("<structure:CodeList id=\"30\"><structure:Name xml:lang=\"ru\">ОКАТО</structure:Name>");
        w.write("<structure:Code value=\"");
        w.write(regionCode);
        w.write("\"><structure:Description xml:lang=\"ru\">Российская Федерация</structure:Description></structure:Code>");
        w.write("</structure:CodeList>");
        w.write("<structure:CodeList id=\"32\"><structure:Name xml:lang=\"ru\">Виды товаров и услуг</structure:Name>");
        for (int i = 0; i < goods; i++) {
            w.write("<structure:Code value=\"");
            w.write(String.valueOf(105 + i));
            w.write("\"><structure:Description xml:lang=\"ru\">Товар ");
            w.write(String.valueOf(i));
            w.write(", кг</structure:Description></structure:Code>");
        }
        w.write("</structure:CodeList></CodeLists>");
    }

    private static void writeDataSet(Writer w, int goods, int months, String regionCode) throws IOException {
        w.write("<DataSet>");
        for (int i = 0; i < goods; i++) {
            for (int m = 1; m <= months; m++) {
                writeSeries(w, regionCode, String.valueOf(105 + i), m);
            }
        }
        w.write("</DataSet>");
    }

    private static void writeSeries(Writer w, String regionCode, String goodsCode, int month)
            throws IOException {
        w.write("<generic:Series><generic:SeriesKey>");
        w.write("<generic:Value concept=\"30\" value=\"");
        w.write(regionCode);
        w.write("\"/><generic:Value concept=\"32\" value=\"");
        w.write(goodsCode);
        w.write("\"/></generic:SeriesKey><generic:Attributes><generic:Value concept=\"PERIOD\" value=\"");
        w.write(monthName(month));
        w.write("\"/></generic:Attributes><generic:Obs><generic:Time>2025</generic:Time>");
        w.write("<generic:ObsValue value=\"");
        w.write(String.valueOf(100 + month));
        w.write(",50\"/></generic:Obs></generic:Series>");
    }

    private static String monthName(int month) {
        return List.of("январь", "февраль", "март", "апрель", "май", "июнь",
                "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь").get(month - 1);
    }
}
