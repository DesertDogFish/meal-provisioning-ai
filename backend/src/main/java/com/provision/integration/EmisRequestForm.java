package com.provision.integration;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Тело POST-формы {@code downloadData.do} — запрос выгрузки SDMX.
 *
 * <p>Вынесено из {@link RosstatEmisProvider} (BL-15): правила «какие значения фильтров
 * и осей отправить» живут отдельно от транспорта и от разбора ответа. Здесь же зашиты
 * инварианты портала, проверенные живым зондом: все поля с несколькими значениями обязаны
 * присутствовать в {@code selectedFilterIds}, а ось «Год» сужать нельзя (302).</p>
 */
final class EmisRequestForm {

    private EmisRequestForm() { }

    /** Тело POST-формы downloadData.do (порядок частей — как в fedstatAPIr
     *  fedstat_post_data_ids_filtered: title, struts.token.name, &lt;имя токена&gt;, id,
     *  lineObjectIds, columnObjectIds, selectedFilterIds, filterObjectIds).
     *
     *  <p>Выбор значений: регион — из конфига (одно значение), поле «Период» — только
     *  {@code periodMonths} последних месяцев (см. {@link #valueIdsFor}), все остальные
     *  поля — все значения словаря. Все поля с несколькими значениями обязаны
     *  присутствовать в selectedFilterIds: иначе портал отвечает 302 («комбинация
     *  фильтров не даёт данных»).</p>
     *
     *  <p>ВНИМАНИЕ: сужать поле «Год» НЕЛЬЗЯ — портал отвечает 302 на любое его
     *  сужение (эксперименты E1/E2 владельца, 28.10.2026: 2026+2025 и 2023+2024 —
     *  оба 302, при этом полный набор годов — 200). Сужение «Периода» и «Товаров»
     *  портал принимает (F1: 1 месяц → 200, 5 649 772 байта; F2: 2 товара → 200,
     *  499 770 байт). Поэтому объём выгрузки режем по месяцам, а не по годам.</p>
     *
     * @param today точка отсчёта для окна месяцев (внедряется ради детерминизма тестов)
     */
    static String buildFormBody(String title, StrutsToken token, ObjectIds objects,
                                EmisFilters filters, String regionTitle, String indicatorId,
                                int periodMonths, LocalDate today) {
        List<String> selected = new ArrayList<>();
        List<String> line = new ArrayList<>(objects.line());
        List<String> column = new ArrayList<>(objects.column());
        // «0» — особое поле (сам показатель): в fedstatAPIr оно уходит в
        // filterObjectIds, а не в оси таблицы.
        boolean zeroSeen = line.contains("0") || column.contains("0");

        boolean hasFieldZero = false;
        for (EmisField f : filters.fields().values()) {
            if ("0".equals(f.id())) {
                hasFieldZero = true;
                for (String vid : f.values().keySet()) selected.add("0_" + vid);
                continue;
            }
            if (isRegionField(f)) {
                String vid = EmisValues.pickRegionValue(f, regionTitle);
                if (vid != null) selected.add(f.id() + "_" + vid);
            } else {
                for (String vid : valueIdsFor(f, periodMonths, today)) selected.add(f.id() + "_" + vid);
            }
            // Поля, не упомянутые в осях, по умолчанию — строки (default из parse_js2)
            if (!line.contains(f.id()) && !column.contains(f.id())) line.add(f.id());
        }
        if (!hasFieldZero) selected.add(0, "0_" + indicatorId);

        StringBuilder sb = new StringBuilder();
        appendForm(sb, "title", title);
        appendForm(sb, "struts.token.name", token.name());
        // FIX (дефект №1 плана 2026-10-28-emis-download-csrf-and-volume): имя CSRF-поля —
        // это значение input[name=struts.token.name] со страницы (на fedstat.ru — «token»),
        // а НЕ литерал «struts.token». С литералом портал не находит токен и отвечает
        // 200 + 127 байт «<p align="center">CSRF блокировка». Фолбэк — на случай, если имя
        // в разметке пустое.
        String tokenField = (token.name() == null || token.name().isBlank())
                ? "struts.token" : token.name();
        appendForm(sb, tokenField, token.value());
        // FIX (дефект №2 того же плана): без id=<показатель> экшен downloadData.do не знает,
        // что выгружать, и отвечает 200 + 41 КБ HTML — перерисованной страницей показателя.
        appendForm(sb, "id", indicatorId);
        for (String id : line) appendForm(sb, "lineObjectIds", id);
        for (String id : column) appendForm(sb, "columnObjectIds", id);
        for (String id : selected) appendForm(sb, "selectedFilterIds", id);
        if (!zeroSeen) appendForm(sb, "filterObjectIds", "0");
        return sb.toString();
    }

    /** Id значений поля, которые попадут в выгрузку.
     *
     *  <p>Сужаем только поле «Период»: оставляем {@code periodMonths} последних месяцев
     *  (см. {@link #recentMonths}). Исторически это была защита от OOM (дефект №6 плана
     *  2026-10-28-emis-download-csrf-and-volume): полный ряд — 885 товаров × 450 ОКАТО ×
     *  27 лет × 12 месяцев, ответ ЕМИСС 65 076 787 байт, который читался в {@code String}
     *  (~130 МБ) и разбирался полным DOM (пик ~600–700 МБ heap). С 29.10.2026 разбор
     *  потоковый (StAX, KB-1) и память от объёма ответа не зависит: 66 МБ разбирались
     *  в 128 МБ heap. Поэтому сужение месяцев — способ сократить время ответа портала
     *  и объём локальной копии, а не требование памяти. Один месяц — 5 649 772 байта
     *  (эксперимент F1).</p>
     *
     *  <p>Поле «Год» намеренно НЕ сужается: портал отвечает 302 на любое сужение этой оси
     *  (эксперименты E1/E2 — 2026+2025 и 2023+2024, оба 302; полный набор годов — 200).</p>
     *
     *  <p>Защитные случаи: {@code periodMonths <= 0} — не сужать; заголовки не распознаны
     *  как месяцы — не сужать (лучше выгрузить лишнее, чем молча потерять данные);
     *  нераспознанное значение внутри поля сохраняется всегда.</p> */
    static Collection<String> valueIdsFor(EmisField field, int periodMonths, LocalDate today) {
        if (periodMonths <= 0 || !isPeriodField(field)) return field.values().keySet();
        Set<Integer> keep = recentMonths(periodMonths, today);
        Set<String> out = new LinkedHashSet<>();
        boolean matched = false;
        for (Map.Entry<String, String> e : field.values().entrySet()) {
            Integer month = EmisValues.monthFromRuName(e.getValue());
            if (month == null) {
                out.add(e.getKey());
            } else if (keep.contains(month)) {
                out.add(e.getKey());
                matched = true;
            }
        }
        return matched ? out : field.values().keySet();
    }

    /** Номера {@code count} последних месяцев, заканчивая ПРОШЛЫМ: данные за текущий месяц
     *  ЕМИСС публикует только на 6–10-й рабочий день после его окончания, поэтому текущий
     *  месяц в окно не берём. Пример: сегодня 28.10.2026, count=2 → {9, 8}. */
    static Set<Integer> recentMonths(int count, LocalDate today) {
        Set<Integer> out = new LinkedHashSet<>();
        LocalDate cursor = today.minusMonths(1);
        for (int i = 0; i < Math.min(Math.max(count, 0), 12); i++) {
            out.add(cursor.getMonthValue());
            cursor = cursor.minusMonths(1);
        }
        return out;
    }

    /** Поле месяцев («Период»). Поле «Год» сюда не попадает намеренно: его сужение
     *  портал отклоняет (302), см. {@link #valueIdsFor}. */
    static boolean isPeriodField(EmisField f) {
        if (f == null || f.title() == null) return false;
        String t = EmisValues.normalize(f.title()).strip();
        return t.equals("период") || t.startsWith("период ");
    }

    private static void appendForm(StringBuilder sb, String key, String value) {
        if (!sb.isEmpty()) sb.append('&');
        sb.append(URLEncoder.encode(key, StandardCharsets.UTF_8))
          .append('=')
          .append(URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8));
    }

    static boolean isRegionField(EmisField f) {
        String t = EmisValues.normalize(f.title());
        return t.contains("окато") || t.contains("территор") || t.contains("регион");
    }

    /** Число частей формы с указанным именем — для лога (R10). Считаем по собранному телу,
     *  а не по исходным спискам: оси дополняются fallback-полями уже внутри
     *  {@link #buildFormBody}, поэтому размер `objects.line()` телу не равен. */
    static int countParts(String formBody, String key) {
        int count = 0;
        int i = formBody.indexOf(key);
        while (i >= 0) {
            count++;
            i = formBody.indexOf(key, i + key.length());
        }
        return count;
    }
}
