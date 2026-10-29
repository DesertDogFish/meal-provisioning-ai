package com.provision.service;

import com.provision.integration.EmisSnapshot;
import com.provision.integration.EmisSnapshot.PricePoint;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit-тесты EmisMirrorService (BL-3, KB-9-долг; аудит 29.10.2026, подзадача 27,
 * plans/2026-10-29-full-audit.md): upsert справочника и цен локальной копии,
 * окно хранения period-years, дедупликация внутри выгрузки, счётчики outcome,
 * идемпотентность (ON CONFLICT в SQL upsert'ов).
 *
 * <p>JdbcTemplate — мок: проверяются SQL-контракты (каптча аргументов batchUpdate)
 * и логика окна/счётчиков, а не исполнение SQL (R2 — слой сервиса).</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("EmisMirrorService: локальная копия ЕМИСС (BL-3)")
class EmisMirrorServiceTest {

    private static final String REGION = "643004.АГ";
    private static final int YEAR = LocalDate.now().getYear();

    @Mock
    private JdbcTemplate jdbc;

    private EmisMirrorService service() {
        return new EmisMirrorService(jdbc);
    }

    private EmisSnapshot snapshot(String region, LinkedHashMap<String, String> catalog,
                                  Map<String, List<PricePoint>> prices) {
        return new EmisSnapshot(Instant.now(), region, catalog, prices);
    }

    private void stubBatches(int catalogRows, int priceRows) {
        if (catalogRows >= 0) {
            when(jdbc.batchUpdate(contains("INSERT INTO emis_products"), anyList()))
                    .thenReturn(ones(catalogRows));
        }
        if (priceRows >= 0) {
            when(jdbc.batchUpdate(contains("INSERT INTO emis_prices"), anyList()))
                    .thenReturn(ones(priceRows));
        }
    }

    private int[] ones(int n) {
        int[] r = new int[n];
        java.util.Arrays.fill(r, 1);
        return r;
    }

    @Test
    @DisplayName("upsert справочника: код/имя/единица разбираются EmisUnit.of, SQL идемпотентен (ON CONFLICT)")
    @SuppressWarnings("unchecked")
    void store_upsertsCatalog() {
        LinkedHashMap<String, String> catalog = new LinkedHashMap<>();
        catalog.put("8016", "Крупа гречневая, кг");
        stubBatches(1, -1);
        when(jdbc.update(contains("DELETE FROM emis_prices"), eq(REGION), org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(0);

        EmisMirrorService.MirrorOutcome out = service().store(
                snapshot(REGION, catalog, Map.of()), REGION, 2);

        assertThat(out.catalogUpserted()).isEqualTo(1);
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(jdbc).batchUpdate(argThat(sql -> sql.contains("ON CONFLICT (code) DO UPDATE")), rows.capture());
        Object[] row = rows.getValue().get(0);
        assertThat(row[0]).isEqualTo("8016");
        assertThat(row[1]).isEqualTo("Крупа гречневая, кг");
        assertThat(row[2]).isEqualTo("MASS");      // unit_kind из суффикса «, кг»
        assertThat(row[3]).isEqualTo(BigDecimal.ONE);
        assertThat(row[4]).isEqualTo("KG");
        assertThat(out.regionCode()).isEqualTo(REGION);
    }

    @Test
    @DisplayName("окно period-years=2: точки вне окна и мусор отбрасываются, устаревшие удаляются DELETE")
    @SuppressWarnings("unchecked")
    void store_windowTrimming() {
        List<PricePoint> points = new ArrayList<>();
        points.add(new PricePoint(LocalDate.of(YEAR, 4, 1), new BigDecimal("198.32")));     // в окне
        points.add(new PricePoint(LocalDate.of(YEAR - 1, 6, 1), new BigDecimal("180.00"))); // в окне
        points.add(new PricePoint(LocalDate.of(YEAR - 2, 1, 1), new BigDecimal("150.00"))); // вне окна
        points.add(new PricePoint(LocalDate.of(YEAR, 5, 1), BigDecimal.ZERO));               // price<=0
        points.add(new PricePoint(null, new BigDecimal("10.00")));                           // без даты
        Map<String, List<PricePoint>> prices = Map.of("8016", points);

        stubBatches(-1, 2); // каталог пуст — batch справочника не вызывается
        when(jdbc.update(contains("DELETE FROM emis_prices"), eq(REGION), eq(YEAR - 1)))
                .thenReturn(7);

        EmisMirrorService.MirrorOutcome out = service().store(
                snapshot(REGION, new LinkedHashMap<>(), prices), REGION, 2);

        assertThat(out.pricePoints()).isEqualTo(5);     // сколько увидели
        assertThat(out.pricesUpserted()).isEqualTo(2);  // сколько уложено
        assertThat(out.pricesDropped()).isEqualTo(3);   // вне окна + ноль + без даты
        assertThat(out.pricesDeleted()).isEqualTo(7);   // ретеншен старой БД
        assertThat(out.yearFrom()).isEqualTo(YEAR - 1);
        assertThat(out.yearTo()).isEqualTo(YEAR);

        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(jdbc).batchUpdate(argThat(sql -> sql.contains("ON CONFLICT (emis_code, region_code, period_year, period_month)")),
                rows.capture());
        assertThat(rows.getValue()).hasSize(2);
        verify(jdbc).update(contains("DELETE FROM emis_prices"), eq(REGION), eq(YEAR - 1));
    }

    @Test
    @DisplayName("дедупликация внутри выгрузки: два наблюдения одного месяца → одна строка (ON CONFLICT не видит дубль-ключ)")
    @SuppressWarnings("unchecked")
    void store_dedupesSameMonth() {
        List<PricePoint> points = new ArrayList<>();
        points.add(new PricePoint(LocalDate.of(YEAR, 4, 1), new BigDecimal("198.32")));
        points.add(new PricePoint(LocalDate.of(YEAR, 4, 15), new BigDecimal("199.99")));
        stubBatches(-1, 1);
        when(jdbc.update(contains("DELETE FROM emis_prices"), anyString(), org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(0);

        EmisMirrorService.MirrorOutcome out = service().store(
                snapshot(REGION, null, Map.of("8016", points)), REGION, 2);

        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(jdbc).batchUpdate(contains("INSERT INTO emis_prices"), rows.capture());
        assertThat(rows.getValue()).hasSize(1);
        // последнее наблюдение месяца побеждает (setScale(2, HALF_UP))
        assertThat((BigDecimal) rows.getValue().get(0)[4]).isEqualByComparingTo("199.99");
        assertThat(out.pricesUpserted()).isEqualTo(1);
        assertThat(out.pricesDropped()).isZero();
    }

    @Test
    @DisplayName("регион из слепка приоритетнее конфига; пустой код/список цен пропускаются")
    void store_regionFallbackAndBlankSkip() {
        Map<String, List<PricePoint>> prices = new java.util.HashMap<>();
        prices.put("  ", List.of(new PricePoint(LocalDate.of(YEAR, 4, 1), BigDecimal.ONE))); // blank code
        prices.put("105", null);                                                              // null-список
        stubBatches(-1, -1);
        when(jdbc.update(contains("DELETE FROM emis_prices"), anyString(), org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(0);

        EmisMirrorService.MirrorOutcome out = service().store(
                snapshot(null, null, prices), REGION, 2);

        // snapshot.regionCode == null → defaultRegionCode
        assertThat(out.regionCode()).isEqualTo(REGION);
        // blank-код и null-список пропускаются ЦЕЛИКОМ — их точки не считаются вовсе
        assertThat(out.pricePoints()).isZero();
        assertThat(out.pricesUpserted()).isZero();
        assertThat(out.pricesDropped()).isZero();
        verify(jdbc, never()).batchUpdate(contains("INSERT INTO emis_prices"), anyList());
    }

    @Test
    @DisplayName("регион не определён ни в слепке, ни в конфиге — IllegalStateException с ясной причиной")
    void store_noRegion_fails() {
        assertThatThrownBy(() -> service().store(snapshot(" ", null, Map.of()), "  ", 2))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("регион не определён");
    }

    @Test
    @DisplayName("periodYears<1 нормализуется к 1 (окно — текущий год)")
    void store_periodYearsNormalized() {
        stubBatches(-1, -1);
        when(jdbc.update(contains("DELETE FROM emis_prices"), anyString(), org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(0);

        EmisMirrorService.MirrorOutcome out = service().store(
                snapshot(REGION, null, Map.of()), REGION, 0);

        assertThat(out.yearFrom()).isEqualTo(YEAR);
        assertThat(out.yearTo()).isEqualTo(YEAR);
    }
}
