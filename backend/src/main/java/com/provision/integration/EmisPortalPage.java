package com.provision.integration;

import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Одноразовый CSRF-токен Struts: имя поля (из {@code input[name=struts.token.name]}) и значение. */
record StrutsToken(String name, String value) {}

/** Справочник одного поля фильтров страницы показателя. */
record EmisField(String id, String title, LinkedHashMap<String, String> values) {}

record EmisFilters(LinkedHashMap<String, EmisField> fields) {}

/** Раскладка осей таблицы (left_columns+groups → строки, top_columns → колонки). */
record ObjectIds(List<String> line, List<String> column) {}

/**
 * Разбор HTML/JS страницы показателя ЕМИСС ({@code /indicator/<id>}): одноразовый
 * CSRF-токен, словарь фильтров из встроенного JS, раскладка осей таблицы, заголовок показателя.
 *
 * <p>Вынесено из {@link RosstatEmisProvider} (BL-15): это отдельная ответственность —
 * «прочитать разметку портала», а не «сходить за данными». Все функции чистые (строка → модель),
 * поэтому тестируются на фикстурах без сети; референс разметки — CRAN-пакет fedstatAPIr
 * и живой зонд владельца 28.10.2026 ({@code plans/done/2026-10-28-emis-download-csrf-and-volume.md}).</p>
 */
final class EmisPortalPage {

    private EmisPortalPage() { }

    /** Jackson, читающий JS-объектный литерал страницы ЕМИСС напрямую
     *  (нецитированные ключи, одинарные кавычки, trailing commas) — вместо
     *  хрупких строковых преобразований из fedstatAPIr (parse_js1/parse_js2). */
    private static final JsonMapper JS_MAPPER = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_UNQUOTED_FIELD_NAMES)
            .enable(JsonReadFeature.ALLOW_SINGLE_QUOTES)
            .enable(JsonReadFeature.ALLOW_TRAILING_COMMA)
            .build();

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

    static EmisField findGoodsField(EmisFilters filters) {
        for (EmisField f : filters.fields().values()) {
            String t = EmisValues.normalize(f.title());
            if ((t.contains("товар") || t.contains("продукт") || t.contains("номенклатур"))
                    && !t.contains("услуг")) {
                return f;
            }
        }
        // «Виды товаров и услуг» — самый частый заголовок у ценовых показателей
        for (EmisField f : filters.fields().values()) {
            if (EmisValues.normalize(f.title()).contains("товар")) return f;
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

    private static String unescapeHtml(String s) {
        return s.replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    }
}
