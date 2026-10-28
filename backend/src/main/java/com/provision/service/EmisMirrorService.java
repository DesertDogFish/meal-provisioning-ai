package com.provision.service;

import com.provision.integration.EmisSnapshot;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Запись выгрузки ЕМИСС в локальную копию ({@code emis_products} / {@code emis_prices}, V26).
 *
 * <p>Это единственная ответственность модуля (R9): «положить слепок в нашу БД». Чтением
 * занимается {@link EmisCatalogService}, перекладыванием цен в {@code ingredient_prices} —
 * {@link EmisPriceApplier}.</p>
 *
 * <p>Пишем через {@link JdbcTemplate} батчами, а не {@code save()} по строке: полная выгрузка
 * за два года — это ~885 позиций справочника и до 21 000 ценовых точек, построчный JPA
 * держал бы транзакцию на минуты. {@code ON CONFLICT … DO UPDATE} делает прогон
 * идемпотентным: повторная синхронизация обновляет цены, а не плодит дубли.</p>
 *
 * <p>Глубина хранения ограничена окном {@code periodYears} (два последних года): точки старше
 * отбрасываются на входе и удаляются из таблицы на выходе — «сколько лет назад хранить» больше
 * не решается где-то в недрах провайдера.</p>
 */
@Service
@Slf4j
public class EmisMirrorService {

    private static final String UPSERT_PRODUCT = """
            INSERT INTO emis_products (code, name, unit_kind, unit_amount, unit_scale, unit_label, loaded_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name, unit_kind = EXCLUDED.unit_kind, unit_amount = EXCLUDED.unit_amount,
                unit_scale = EXCLUDED.unit_scale, unit_label = EXCLUDED.unit_label,
                loaded_at = CURRENT_TIMESTAMP
            """;

    private static final String UPSERT_PRICE = """
            INSERT INTO emis_prices (emis_code, region_code, period_year, period_month, price, loaded_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (emis_code, region_code, period_year, period_month) DO UPDATE SET
                price = EXCLUDED.price, loaded_at = CURRENT_TIMESTAMP
            """;

    private static final String DELETE_OLD_PRICES =
            "DELETE FROM emis_prices WHERE region_code = ? AND period_year < ?";

    private final JdbcTemplate jdbc;

    public EmisMirrorService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @param regionCode        регион, под которым храним точки (из слепка; fallback — конфиг)
     * @param catalogUpserted   сколько позиций справочника записано/обновлено
     * @param pricePoints       сколько точек цен пришло в выгрузке
     * @param pricesUpserted    сколько точек уложено в окно хранения
     * @param pricesDropped     сколько точек отброшено (вне окна «два последних года»)
     * @param pricesDeleted     сколько устаревших точек удалено из таблицы (ретеншен)
     */
    public record MirrorOutcome(String regionCode, int catalogUpserted, int pricePoints,
                                int pricesUpserted, int pricesDropped, int pricesDeleted,
                                int yearFrom, int yearTo) {}

    /**
     * Короткая транзакция на всю запись: слепок уже в памяти (внешний HTTP остался позади),
     * поэтому держать её открытой долго не нужно, а атомарность «справочник + цены» полезна —
     * локальная копия не должна оставаться наполовину обновлённой.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MirrorOutcome store(EmisSnapshot snapshot, String defaultRegionCode, int periodYears) {
        String regionCode = isBlank(snapshot.regionCode()) ? defaultRegionCode : snapshot.regionCode().trim();
        if (isBlank(regionCode)) {
            throw new IllegalStateException(
                    "ЕМИСС: регион не определён ни в выгрузке, ни в конфиге integration.rosstat.region-code");
        }
        int years = Math.max(1, periodYears);
        int yearTo = LocalDate.now().getYear();
        int yearFrom = yearTo - years + 1;

        int catalogUpserted = upsertCatalog(snapshot.catalog());
        List<Object[]> priceRows = new ArrayList<>();
        int pricePoints = 0;
        int dropped = 0;
        // Дедупликация внутри выгрузки: ON CONFLICT не должен увидеть один ключ дважды.
        Map<String, BigDecimal> latestByKey = new HashMap<>();
        for (Map.Entry<String, List<EmisSnapshot.PricePoint>> e : snapshot.prices().entrySet()) {
            String code = e.getKey();
            if (isBlank(code) || e.getValue() == null) {
                continue;
            }
            for (EmisSnapshot.PricePoint p : e.getValue()) {
                pricePoints++;
                if (p.date() == null || p.price() == null || p.price().compareTo(BigDecimal.ZERO) <= 0) {
                    dropped++;
                    continue;
                }
                int year = p.date().getYear();
                if (year < yearFrom || year > yearTo) {
                    dropped++;
                    continue;
                }
                latestByKey.put(code + '|' + year + '|' + p.date().getMonthValue(),
                        p.price().setScale(2, RoundingMode.HALF_UP));
            }
        }
        for (Map.Entry<String, BigDecimal> e : latestByKey.entrySet()) {
            String[] parts = e.getKey().split("\\|");
            priceRows.add(new Object[]{parts[0], regionCode, Integer.parseInt(parts[1]),
                    Integer.parseInt(parts[2]), e.getValue()});
        }
        int pricesUpserted = priceRows.isEmpty() ? 0 : count(jdbc.batchUpdate(UPSERT_PRICE, priceRows));
        int deleted = jdbc.update(DELETE_OLD_PRICES, regionCode, yearFrom);

        log.info("ЕМИСС: локальная копия обновлена — регион={} справочник={} точек в выгрузке={} "
                        + "уложено={} отброшено={} удалено устаревших={} окно={}-{}",
                regionCode, catalogUpserted, pricePoints, pricesUpserted, dropped, deleted, yearFrom, yearTo);
        return new MirrorOutcome(regionCode, catalogUpserted, pricePoints, pricesUpserted,
                dropped, deleted, yearFrom, yearTo);
    }

    private int upsertCatalog(Map<String, String> catalog) {
        if (catalog == null || catalog.isEmpty()) {
            return 0;
        }
        List<Object[]> rows = new ArrayList<>(catalog.size());
        for (Map.Entry<String, String> e : catalog.entrySet()) {
            if (isBlank(e.getKey()) || isBlank(e.getValue())) {
                continue;
            }
            EmisUnit unit = EmisUnit.of(e.getValue());
            rows.add(new Object[]{e.getKey().trim(), e.getValue().trim(), unit.kind(),
                    unit.amount(), unit.scale(), unit.label()});
        }
        return rows.isEmpty() ? 0 : count(jdbc.batchUpdate(UPSERT_PRODUCT, rows));
    }

    private static int count(int[] batchResult) {
        int n = 0;
        for (int r : batchResult) {
            // SUCCESS_NO_INFO (-2) — драйвер не вернул счётчик, но строка записана.
            if (r >= 0 || r == java.sql.Statement.SUCCESS_NO_INFO) {
                n++;
            }
        }
        return n;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
