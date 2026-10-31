package com.provision.service;

import com.provision.dto.summary.DayShoppingResponse;
import com.provision.dto.summary.ShoppingItemResponse;
import com.provision.dto.summary.ShoppingListResponse;
import com.provision.dto.trip.TripProgressResponse;
import com.provision.entity.Ingredient;
import com.provision.entity.Trip;
import com.provision.entity.TripDay;
import com.provision.entity.TripMeal;
import com.provision.entity.TripShoppingExclusion;
import com.provision.entity.UnitOfMeasure;
import com.provision.repository.TripShoppingExclusionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.8, вариант A): прогресс
 * карточек списка походов считается на сервере. Проверяем семантику, идентичную
 * клиентскому deriveTripView: факт-цены (overridden), глобальные и по-дневные
 * исключения, realPeople (среднее по дням с peopleOverride), stage-правило
 * (facts → checks, иначе непустая закупка → shopping, иначе menu) и best-effort
 * (сбой расчёта одного похода → progress=null, список не падает).
 */
class TripProgressServiceTest {

    private SummaryService summaryService;
    private TripShoppingExclusionRepository exclusionRepository;
    private TripProgressService service;

    @BeforeEach
    void setUp() {
        summaryService = mock(SummaryService.class);
        exclusionRepository = mock(TripShoppingExclusionRepository.class);
        service = new TripProgressService(summaryService, exclusionRepository);
    }

    // ---------- фикстуры ----------

    private static ShoppingItemResponse item(Long id, String name, String planned, String actual, boolean overridden) {
        BigDecimal plannedCost = planned != null ? new BigDecimal(planned) : null;
        BigDecimal actualCost = actual != null ? new BigDecimal(actual) : null;
        return new ShoppingItemResponse(
                id, name, UnitOfMeasure.KG, BigDecimal.ONE,
                planned != null ? new BigDecimal(planned) : null,
                actual != null ? new BigDecimal(actual) : null,
                plannedCost, actualCost, overridden, planned != null,
                null, null, null, null, null);
    }

    private static ShoppingListResponse shoppingList(ShoppingItemResponse... items) {
        return new ShoppingListResponse(Arrays.asList(items), null, null, null, 0, false, List.of());
    }

    private static DayShoppingResponse day(String dayDate, ShoppingItemResponse... items) {
        return new DayShoppingResponse(dayDate, Arrays.asList(items), null, null, false);
    }

    private static SummaryService.ShoppingComputation comp(ShoppingListResponse list, DayShoppingResponse... byDays) {
        return new SummaryService.ShoppingComputation(list, Arrays.asList(byDays), 4, BigDecimal.ZERO);
    }

    private static Trip trip(Integer defaultPeople, Integer... peopleOverrides) {
        Trip trip = Trip.builder()
                .id(1L)
                .startDate(LocalDate.of(2026, 7, 1))
                .endDate(LocalDate.of(2026, 7, 2))
                .defaultPeople(defaultPeople)
                .build();
        LinkedHashSet<TripDay> days = new LinkedHashSet<>();
        long dayNum = 1;
        for (Integer override : peopleOverrides) {
            TripDay d = TripDay.builder()
                    .id(dayNum)
                    .trip(trip)
                    .dayDate(LocalDate.of(2026, 7, (int) dayNum))
                    .peopleOverride(override)
                    .build();
            TripMeal m = TripMeal.builder().id(dayNum).tripDay(d).build();
            d.setMeals(new LinkedHashSet<>(List.of(m)));
            days.add(d);
            dayNum++;
        }
        trip.setDays(days);
        return trip;
    }

    private static TripShoppingExclusion exclusion(Long ingredientId, LocalDate dayDate) {
        return TripShoppingExclusion.builder()
                .ingredient(Ingredient.builder().id(ingredientId).build())
                .dayDate(dayDate)
                .build();
    }

    // ---------- тесты ----------

    @Test
    void noFactsNoExclusions_stageShopping_totalsFromPlanned() {
        Trip trip = trip(2, null, null);
        var comp = comp(shoppingList(
                item(1L, "Гречка", "100", "100", false),
                item(2L, "Без цены", null, null, false)));

        TripProgressResponse p = service.compute(trip, comp, List.of());

        assertThat(p.stage()).isEqualTo("shopping");
        assertThat(p.checklistTotal()).isEqualTo(2);
        assertThat(p.facts()).isZero();
        assertThat(p.factsTotal()).isEqualTo(2);
        assertThat(p.meals()).isEqualTo(2); // по одному приёму на день
        assertThat(p.totalCost()).isEqualByComparingTo("100"); // null-цена честно даёт 0
        assertThat(p.costPerPerson()).isEqualByComparingTo("50"); // 100 / 2 чел.
    }

    @Test
    void overriddenItem_stageChecks_factPriceWins() {
        Trip trip = trip(2, null, null);
        var comp = comp(shoppingList(
                item(1L, "Гречка", "100", "120", true),
                item(2L, "Тушёнка", "50", "50", false)));

        TripProgressResponse p = service.compute(trip, comp, List.of());

        assertThat(p.stage()).isEqualTo("checks");
        assertThat(p.facts()).isEqualTo(1);
        assertThat(p.totalCost()).isEqualByComparingTo("170");
        assertThat(p.costPerPerson()).isEqualByComparingTo("85");
    }

    @Test
    void globalExclusion_removesRowFromCountersAndTotals() {
        Trip trip = trip(2, null, null);
        var comp = comp(shoppingList(
                item(1L, "Гречка", "100", "120", true),
                item(2L, "Тушёнка", "50", "50", false)));

        TripProgressResponse p = service.compute(trip, comp, List.of(exclusion(2L, null)));

        assertThat(p.checklistTotal()).isEqualTo(1);
        assertThat(p.facts()).isEqualTo(1);
        assertThat(p.totalCost()).isEqualByComparingTo("120");
        assertThat(p.stage()).isEqualTo("checks");
    }

    @Test
    void dayScopedExclusion_reducesAggregateViaByDays() {
        Trip trip = trip(2, null, null);
        // агрегат: Тушёнка 2 дня × 50 = 100; день 2026-07-02 исключён → считаем только день 1
        var comp = comp(
                shoppingList(
                        item(1L, "Гречка", "100", "100", false),
                        item(2L, "Тушёнка", "100", "100", false)),
                day("2026-07-01", item(1L, "Гречка", "100", "100", false), item(2L, "Тушёнка", "50", "50", false)),
                day("2026-07-02", item(2L, "Тушёнка", "50", "50", false)));

        TripProgressResponse p = service.compute(trip, comp,
                List.of(exclusion(2L, LocalDate.of(2026, 7, 2))));

        assertThat(p.checklistTotal()).isEqualTo(2); // позиция остаётся (день 1 не исключён)
        assertThat(p.totalCost()).isEqualByComparingTo("150"); // 100 (Гречка) + 50 (Тушёнка, день 1)
        assertThat(p.stage()).isEqualTo("shopping");
    }

    @Test
    void peopleOverride_reflectedInCostPerPerson() {
        Trip trip = trip(2, 4, null); // день 1: 4 чел., день 2: 2 чел. → среднее 3
        var comp = comp(shoppingList(item(1L, "Гречка", "150", "150", false)));

        TripProgressResponse p = service.compute(trip, comp, List.of());

        assertThat(p.costPerPerson()).isEqualByComparingTo("50"); // 150 / 3
    }

    @Test
    void emptyTrip_stageMenu_noCrash() {
        Trip trip = Trip.builder().id(9L).defaultPeople(2)
                .startDate(LocalDate.of(2026, 7, 1)).endDate(LocalDate.of(2026, 7, 1)).build();
        trip.setDays(new LinkedHashSet<>());
        var comp = comp(shoppingList());

        TripProgressResponse p = service.compute(trip, comp, List.of());

        assertThat(p.stage()).isEqualTo("menu");
        assertThat(p.checklistTotal()).isZero();
        assertThat(p.meals()).isZero();
        assertThat(p.totalCost()).isEqualByComparingTo("0");
        assertThat(p.costPerPerson()).isEqualByComparingTo("0");
    }

    @Test
    void computeForList_isBestEffort_nullOnFailure() {
        Trip trip = trip(2, null, null);
        when(summaryService.computeShoppingForTrip(any())).thenThrow(new RuntimeException("boom"));
        when(exclusionRepository.findByTripId(any())).thenReturn(List.of());

        assertThat(service.computeForList(trip)).isNull();
    }

    @Test
    void computeForList_usesServerExclusions() {
        Trip trip = trip(2, null, null);
        when(summaryService.computeShoppingForTrip(any())).thenReturn(comp(shoppingList(
                item(1L, "Гречка", "100", "100", false),
                item(2L, "Тушёнка", "50", "50", false))));
        when(exclusionRepository.findByTripId(1L)).thenReturn(List.of(exclusion(2L, null)));

        TripProgressResponse p = service.computeForList(trip);

        assertThat(p).isNotNull();
        assertThat(p.checklistTotal()).isEqualTo(1);
        assertThat(p.totalCost()).isEqualByComparingTo("100");
    }
}
