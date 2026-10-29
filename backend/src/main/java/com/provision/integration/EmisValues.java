package com.provision.integration;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Чистые преобразования значений ЕМИСС: нормализация строк, десятичные с запятой,
 * периоды SDMX, русские названия месяцев, выбор значения региона из словаря.
 *
 * <p>Вынесено из {@link RosstatEmisProvider} (BL-15): этими функциями пользуются ТРИ
 * модуля — потоковый парсер {@link SdmxStreamParser}, сборка формы {@link EmisRequestForm}
 * и разбор страницы показателя {@link EmisPortalPage}. Здесь нет ни сети, ни состояния,
 * поэтому функции тестируются напрямую (покрывают {@code RosstatEmisProviderTest}).</p>
 */
final class EmisValues {

    private EmisValues() { }

    static String findFieldByTitle(Map<String, String> titles, String... needles) {
        for (var e : titles.entrySet()) {
            String t = normalize(e.getValue());
            for (String n : needles) {
                if (t.contains(n)) return e.getKey();
            }
        }
        return null;
    }

    /** Основы русских названий месяцев; «мар» проверяется раньше «ма», чтобы март не стал маем. */
    private static final String[] RU_MONTH_STEMS =
            {"янв", "фев", "мар", "апр", "ма", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"};

    /** «январь»/«января»/«ЯНВАРЬ» → 1; «I квартал», null, пустая строка → null. */
    static Integer monthFromRuName(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim().toLowerCase(java.util.Locale.ROOT).replace('ё', 'е');
        for (int i = 0; i < RU_MONTH_STEMS.length; i++) {
            if (t.startsWith(RU_MONTH_STEMS[i])) return i + 1;
        }
        return null;
    }

    /** «2024-09» / «2024M09» / «2024-09-01» / «2024» → первый день периода. */
    static LocalDate parsePeriod(String s) {
        if (s == null || s.isBlank()) return null;
        s = s.trim();
        Matcher m = Pattern.compile("^(\\d{4})[-/M]?(\\d{2})(?:[-/]?(\\d{2}))?$").matcher(s);
        if (m.matches()) {
            int y = Integer.parseInt(m.group(1));
            int mo = Integer.parseInt(m.group(2));
            if (m.group(3) != null) {
                try { return LocalDate.of(y, mo, Integer.parseInt(m.group(3))); } catch (Exception ignore) { }
            }
            if (mo >= 1 && mo <= 12) {
                try { return LocalDate.of(y, mo, 1); } catch (Exception ignore) { }
            }
            return null;
        }
        if (s.matches("^\\d{4}$")) {
            try { return LocalDate.of(Integer.parseInt(s), 1, 1); } catch (Exception ignore) { }
        }
        return null;
    }

    static BigDecimal parseDecimal(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return new BigDecimal(s.trim().replace(',', '.').replace(" ", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String normalize(String s) {
        return s == null ? "" : s.toLowerCase().replaceAll("\\s+", " ").trim();
    }

    /** Значение региона в поле фильтров страницы: точное совпадение → вхождение конфига
     *  → «российская…» → первое. */
    static String pickRegionValue(EmisField f, String regionTitle) {
        return pickRegionValue(f.values(), regionTitle);
    }

    /** То же для «голого» словаря значений — путь {@link SdmxStreamParser}, где справочник
     *  региона уже разобран из CodeList и модели страницы нет. */
    static String pickRegionValue(Map<String, String> values, String regionTitle) {
        if (values.isEmpty()) return null;
        String want = normalize(regionTitle);
        for (var e : values.entrySet()) {
            if (normalize(e.getValue()).equals(want)) return e.getKey();
        }
        for (var e : values.entrySet()) {
            if (normalize(e.getValue()).contains(want)) return e.getKey();
        }
        for (var e : values.entrySet()) {
            if (normalize(e.getValue()).contains("российск")) return e.getKey();
        }
        return values.keySet().iterator().next();
    }
}
