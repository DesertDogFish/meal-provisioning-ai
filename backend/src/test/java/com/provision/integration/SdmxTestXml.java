package com.provision.integration;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public final class SdmxTestXml {

    private SdmxTestXml() {
    }

    public static String resource(String path) throws IOException {
        try (InputStream in = SdmxStreamParserTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IOException("нет тестового ресурса: " + path);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    public static String docOpen() {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <GenericData xmlns="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/message"
                             xmlns:generic="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/generic"
                             xmlns:structure="http://www.SDMX.org/resources/SDMXML/schemas/v1_0/structure">
                """;
    }

    public static String doc(String body) {
        return docOpen() + body + "\n</GenericData>";
    }

    public static String bigDoc(int goods, int months, String regionCode) {
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

    public static String bigDocWithSecondRegion(int goods, int months) {
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