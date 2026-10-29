package com.provision.integration;

import com.provision.exception.IntegrationUnavailableException;
import com.provision.integration.EmisSnapshot.PricePoint;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Потоковый разбор SDMX GenericData (StAX) — ответ портала ЕМИСС и файл, загруженный админом.
 *
 * <p>Зачем не DOM (план {@code plans/done/2026-10-29-sdmx-stax-streaming.md}, дефект KB-1): полный
 * ряд выгрузки (все товары × 27 лет, один регион) — <b>65 076 787 байт</b>. DOM-разбор такого
 * ответа требовал ~130 МБ на {@code String} и пик 600–700 МБ heap, поэтому объём приходилось
 * резать предохранителем {@code integration.rosstat.max-response-bytes} и сужением окна.
 * StAX читает ответ потоком: в памяти живёт только ОДИН ряд ({@code Series}) или один словарь
 * ({@code CodeList}), а не весь документ, поэтому глубина истории и объём выгрузки больше не
 * ограничены heap — снимается и гап KB-2 (ось «Год» в запросе к порталу остаётся полной,
 * сужать её не нужно).</p>
 *
 * <p>Порядок элементов в ответе fedstat.ru: {@code Structure/CodeLists} идут ДО
 * {@code DataSet/Series}, поэтому словари измерений известны к первому ряду. На случай
 * обратного порядка ряды буферизуются ({@link #MAX_PENDING_SERIES}) и разбираются в конце —
 * в боевом ответе буфер пуст.</p>
 *
 * <p>Семантика разбора один в один повторяет прежний DOM-вариант (те же чистые функции
 * {@link EmisValues}: {@code findFieldByTitle}, {@code pickRegionValue},
 * {@code monthFromRuName}, {@code parsePeriod}, {@code parseDecimal}), поэтому существующие
 * фикстуры {@code RosstatEmisProviderTest} (включая боевую {@code emis/data-31448-real.xml})
 * проходят без правок.</p>
 *
 * <p>Безопасность: DTD и внешние сущности запрещены (замена прежнего
 * {@code disallow-doctype-decl} — защита от XXE сохраняется); пространства имён игнорируются
 * (работаем по {@code localName}, как и раньше: портал отдаёт то {@code GenericData},
 * то {@code generic:Series} с разными префиксами).</p>
 */
final class SdmxStreamParser {

    /**
     * Сколько рядов допускается встретить ДО словарей измерений. В боевом ответе таких нет;
     * предел нужен, чтобы ответ с изменившейся структурой не съел heap буфером рядов,
     * а завершился внятной ошибкой.
     */
    private static final int MAX_PENDING_SERIES = 10_000;

    private SdmxStreamParser() {
    }

    /**
     * Разбор SDMX-ответа.
     *
     * @param in          поток с XML (закрывается вызывающим кодом)
     * @param regionTitle название региона из конфига — по нему выбирается код ОКАТО рядов
     * @param maxBytes    предел объёма ответа в байтах; ≤ 0 — без ограничения. При превышении
     *                    чтение обрывается (прежний DOM-вариант отказывался парсить уже
     *                    скачанный ответ целиком — память к тому моменту была потрачена)
     * @return слепок выгрузки: справочник позиций и ряды цен по региону
     */
    static EmisSnapshot parse(InputStream in, String regionTitle, long maxBytes) {
        SdmxState state = new SdmxState(regionTitle);
        XMLStreamReader reader = null;
        try {
            XMLInputFactory factory = XMLInputFactory.newInstance();
            // XXE: DTD и внешние сущности запрещены (аналог disallow-doctype-decl у DOM).
            factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
            factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
            factory.setProperty(XMLInputFactory.IS_NAMESPACE_AWARE, true);
            InputStream source = maxBytes > 0 ? new LimitedInputStream(in, maxBytes) : in;
            reader = factory.createXMLStreamReader(source);

            Deque<XmlNode> stack = new ArrayDeque<>();
            while (reader.hasNext()) {
                int event = reader.next();
                switch (event) {
                    case XMLStreamConstants.START_ELEMENT -> {
                        XmlNode node = XmlNode.of(reader);
                        if (!stack.isEmpty()) {
                            stack.peek().children.add(node);
                            stack.push(node);
                        } else if ("CodeList".equals(node.name) || "Series".equals(node.name)) {
                            // Захватываем только поддерево словаря или ряда: документ целиком
                            // в память не попадает (смысл потокового разбора).
                            stack.push(node);
                        }
                        // Прочие структурные элементы (GenericData, Structure, DataSet…) пропускаем.
                    }
                    case XMLStreamConstants.END_ELEMENT -> {
                        if (!stack.isEmpty()) {
                            XmlNode finished = stack.pop();
                            if (stack.isEmpty()) {
                                if ("CodeList".equals(finished.name)) {
                                    state.codeList(finished);
                                } else {
                                    state.series(finished);
                                }
                            }
                        }
                    }
                    // DOM-семантика getTextContent(): текст узла включает текст всех потомков,
                    // поэтому дописываем каждому узлу текущего захваченного поддерева.
                    case XMLStreamConstants.CHARACTERS, XMLStreamConstants.CDATA,
                         XMLStreamConstants.SPACE -> {
                        if (!stack.isEmpty()) {
                            String text = reader.getText();
                            for (XmlNode node : stack) {
                                node.text.append(text);
                            }
                        }
                    }
                    default -> {
                        // комментарии, PI, начало/конец документа — не нужны
                    }
                }
            }
            return state.finish();
        } catch (XMLStreamException e) {
            throw new IntegrationUnavailableException(
                    "ЕМИСС: SDMX-ответ не распознан: " + describe(e), e);
        } finally {
            closeQuietly(reader);
        }
    }

    private static String describe(XMLStreamException e) {
        String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        return message.replaceAll("\\s+", " ").strip();
    }

    private static void closeQuietly(XMLStreamReader reader) {
        if (reader == null) {
            return;
        }
        try {
            reader.close();
        } catch (XMLStreamException | RuntimeException ignore) {
            // закрытие потока — забота вызывающего кода
        }
    }

    /**
     * Лёгкое дерево ОДНОГО элемента ({@code CodeList} или {@code Series}) — замена
     * {@code org.w3c.dom.Element} для потокового разбора. Ряды малы (десятки {@code Obs}),
     * словари — сотни {@code Code}, поэтому захват поддерева не возвращает нас к DOM.
     */
    private static final class XmlNode {
        private final String name;
        private final Map<String, String> attrs;
        private final List<XmlNode> children = new ArrayList<>();
        private final StringBuilder text = new StringBuilder();

        private XmlNode(String name, Map<String, String> attrs) {
            this.name = name;
            this.attrs = attrs;
        }

        static XmlNode of(XMLStreamReader reader) {
            Map<String, String> attrs = new HashMap<>();
            for (int i = 0; i < reader.getAttributeCount(); i++) {
                attrs.put(reader.getAttributeLocalName(i), reader.getAttributeValue(i));
            }
            return new XmlNode(reader.getLocalName(), attrs);
        }

        /** Прямые потомки с указанным localName — аналог прежнего {@code children(parent, name)}. */
        List<XmlNode> byName(String localName) {
            List<XmlNode> out = new ArrayList<>();
            for (XmlNode child : children) {
                if (localName.equals(child.name)) {
                    out.add(child);
                }
            }
            return out;
        }

        boolean hasAttr(String localName) {
            return attrs.containsKey(localName);
        }

        String attr(String localName) {
            return attrs.get(localName);
        }

        /** Текст элемента вместе с текстом потомков, как {@code Element.getTextContent()}. */
        String text() {
            return text.toString().trim();
        }
    }

    /** Счётчик прочитанного с обрывом по пределу — защита от OOM на гигантском ответе. */
    private static final class LimitedInputStream extends FilterInputStream {
        private final long limit;
        private long total;

        LimitedInputStream(InputStream in, long limit) {
            super(in);
            this.limit = limit;
        }

        @Override
        public int read() throws IOException {
            int b = super.read();
            if (b >= 0) {
                count(1);
            }
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            int n = super.read(buf, off, len);
            if (n > 0) {
                count(n);
            }
            return n;
        }

        private void count(long n) {
            total += n;
            if (total > limit) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: ответ выгрузки больше " + limit + " байт (прочитано " + total
                                + ") — чтение оборвано, чтобы не уронить приложение. Увеличьте "
                                + "ROSSTAT_MAX_RESPONSE_BYTES или сузьте окно выгрузки "
                                + "ROSSTAT_PERIOD_MONTHS: портал отклоняет только сужение оси "
                                + "«Год», «Период» и «Товары» сужать можно");
            }
        }
    }

    /**
     * Состояние разбора: словари измерений, определённые по ним поля и собранные цены.
     * Логика совпадает с прежним DOM-вариантом {@code parseSdmx}.
     */
    private static final class SdmxState {
        private final String regionTitle;
        private final Map<String, LinkedHashMap<String, String>> codeLists = new LinkedHashMap<>();
        private final Map<String, String> codeListTitles = new HashMap<>();
        private final Map<String, List<PricePoint>> prices = new LinkedHashMap<>();
        private final List<XmlNode> pending = new ArrayList<>();

        private String productField;
        private String regionField;
        private String typeField;
        private boolean typeHasPrices;
        private String regionCode;

        SdmxState(String regionTitle) {
            this.regionTitle = regionTitle;
        }

        /** Словарь измерения: {@code CodeList/Code@value → текст}, {@code CodeList/Name → заголовок}. */
        void codeList(XmlNode node) {
            String id = node.attr("id");
            if (id == null || id.isEmpty()) {
                return;
            }
            LinkedHashMap<String, String> values = codeLists.computeIfAbsent(id, k -> new LinkedHashMap<>());
            for (XmlNode code : node.byName("Code")) {
                values.put(code.attr("value"), code.text());
            }
            String title = "";
            for (XmlNode name : node.byName("Name")) {
                title = name.text();
                break;
            }
            codeListTitles.put(id, title);
            resolveFields();
        }

        /**
         * Поля измерений определяются по заголовкам словарей: товары, ОКАТО, «виды показателя».
         * Пересчитываются после каждого словаря — к первому ряду они уже известны (CodeLists
         * в ответе портала идут до DataSet).
         */
        private void resolveFields() {
            productField = EmisValues.findFieldByTitle(codeListTitles, "товар", "продукт", "номенклатур");
            regionField = EmisValues.findFieldByTitle(codeListTitles, "окато", "территор");
            typeField = EmisValues.findFieldByTitle(codeListTitles, "виды показателя", "вид показателя");

            // «Виды показателя»: если среди значений есть цены — берём только их
            // (рядом могут лежать индексы). Если цен нет — не фильтруем.
            typeHasPrices = false;
            if (typeField != null) {
                for (var entry : codeLists.getOrDefault(typeField, new LinkedHashMap<String, String>()).entrySet()) {
                    if (EmisValues.normalize(entry.getValue()).contains("цен")) {
                        typeHasPrices = true;
                        break;
                    }
                }
            }
            regionCode = null;
            if (regionField != null) {
                regionCode = EmisValues.pickRegionValue(
                        codeLists.getOrDefault(regionField, new LinkedHashMap<>()), regionTitle);
            }
        }

        /** Ряд цен: фильтр по товару/типу показателя/региону, затем точки наблюдений. */
        void series(XmlNode node) {
            if (productField == null) {
                // Ряд встретился раньше словарей: запоминаем и разберём в конце (в норме не бывает).
                if (pending.size() >= MAX_PENDING_SERIES) {
                    throw new IntegrationUnavailableException(
                            "ЕМИСС: в SDMX-ответе ряды идут раньше словарей измерений и их уже "
                                    + pending.size() + " — структура ответа изменилась, разбор прерван");
                }
                pending.add(node);
                return;
            }
            Map<String, String> dims = new HashMap<>();
            for (XmlNode key : node.byName("SeriesKey")) {
                for (XmlNode value : key.byName("Value")) {
                    String concept = value.hasAttr("concept") ? value.attr("concept") : value.attr("id");
                    dims.put(concept, value.attr("value"));
                }
            }
            String product = dims.get(productField);
            if (product == null) {
                return;
            }
            if (typeField != null && typeHasPrices) {
                String typeValue = dims.get(typeField);
                String typeTitle = typeValue == null ? "" : EmisValues.normalize(
                        codeLists.getOrDefault(typeField, new LinkedHashMap<>()).getOrDefault(typeValue, ""));
                if (!typeTitle.contains("цен")) {
                    return;
                }
            }
            if (regionField != null && regionCode != null) {
                String regionValue = dims.get(regionField);
                if (regionValue != null && !regionValue.equals(regionCode)) {
                    return;
                }
            }
            // SDMX 1.0 (боевая форма ЕМИСС): месяц — атрибут РЯДА, год — внутри OBS.
            Integer seriesMonth = EmisValues.monthFromRuName(seriesAttribute(node, "PERIOD"));
            for (XmlNode obs : node.byName("Obs")) {
                BigDecimal price = EmisValues.parseDecimal(obsValue(obs));
                LocalDate date = obsDate(obs, seriesMonth);
                if (date == null || price == null || price.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }
                prices.computeIfAbsent(product, k -> new ArrayList<>()).add(new PricePoint(date, price));
            }
        }

        EmisSnapshot finish() {
            if (productField == null) {
                throw new IntegrationUnavailableException(
                        "ЕМИСС: в SDMX-ответе не найдено измерение товаров (CodeList «Виды товаров…») "
                                + "— структура изменилась");
            }
            List<XmlNode> early = new ArrayList<>(pending);
            pending.clear();
            for (XmlNode node : early) {
                series(node);
            }
            prices.values().forEach(list -> list.sort(Comparator.comparing(PricePoint::date)));
            // Код региона (ОКАТО) берём из разобранного словаря: под ним точки ложатся в
            // emis_prices. Если измерения территорий в ответе нет — null, и EmisMirrorService
            // подставит код из конфига (integration.rosstat.region-code).
            return new EmisSnapshot(Instant.now(), regionCode,
                    codeLists.getOrDefault(productField, new LinkedHashMap<>()), prices);
        }

        // ---- разбор ряда: те же правила, что и в прежнем DOM-варианте ----

        /** Значение атрибута ряда ({@code Attributes/Value}) по имени концепта. */
        private static String seriesAttribute(XmlNode series, String concept) {
            for (XmlNode attrs : series.byName("Attributes")) {
                for (XmlNode value : attrs.byName("Value")) {
                    String name = value.hasAttr("concept") ? value.attr("concept") : value.attr("id");
                    if (concept.equalsIgnoreCase(name)) {
                        return value.hasAttr("value") ? value.attr("value") : value.text();
                    }
                }
            }
            return null;
        }

        /** Значение наблюдения: атрибут {@code value} у {@code ObsValue} либо его текст. */
        private static String obsValue(XmlNode obs) {
            for (XmlNode value : obs.byName("ObsValue")) {
                if (value.hasAttr("value")) {
                    return value.attr("value");
                }
                if (!value.text().isEmpty()) {
                    return value.text();
                }
            }
            return null;
        }

        /**
         * Дата наблюдения: {@code Obs/Time} + месяц ряда (боевая форма SDMX 1.0), затем
         * {@code Obs/Time} как есть, затем прежний путь SDMX 2.1
         * ({@code ObsDimension}/{@code TimePeriod}/{@code ObsKey}). Годовые ряды без месяца
         * дают 1 января.
         */
        private static LocalDate obsDate(XmlNode obs, Integer seriesMonth) {
            String time = childText(obs, "Time");
            if (time != null) {
                LocalDate parsed = EmisValues.parsePeriod(time);
                if (parsed != null) {
                    if (seriesMonth != null && time.matches("\\d{4}")) {
                        return LocalDate.of(parsed.getYear(), seriesMonth, 1);
                    }
                    return parsed;
                }
            }
            return EmisValues.parsePeriod(obsDimension(obs));
        }

        private static String obsDimension(XmlNode obs) {
            for (XmlNode d : obs.byName("ObsDimension")) {
                if (d.hasAttr("value")) {
                    return d.attr("value");
                }
                if (!d.text().isEmpty()) {
                    return d.text();
                }
            }
            for (XmlNode d : obs.byName("TimePeriod")) {
                if (!d.text().isEmpty()) {
                    return d.text();
                }
            }
            for (XmlNode key : obs.byName("ObsKey")) {
                for (XmlNode value : key.byName("Value")) {
                    String s = value.hasAttr("value") ? value.attr("value") : value.text();
                    if (s != null && s.matches("\\d{4}.*")) {
                        return s;
                    }
                }
            }
            return null;
        }

        private static String childText(XmlNode parent, String localName) {
            for (XmlNode child : parent.byName(localName)) {
                if (!child.text().isEmpty()) {
                    return child.text();
                }
            }
            return null;
        }
    }
}
