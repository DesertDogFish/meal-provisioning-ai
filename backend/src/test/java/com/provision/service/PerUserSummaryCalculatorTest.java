package com.provision.service;

import com.provision.dto.summary.PersonSummaryResponse;
import com.provision.dto.summary.ShoppingItemResponse;
import com.provision.dto.summary.ShoppingListResponse;
import com.provision.entity.Trip;
import com.provision.entity.UnitOfMeasure;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Подзадача 12 (план plans/2026-10-29-full-audit.md): PerUserSummaryCalculator —
 * сводка «на человека»: деление итогов на defaultPeople и человеко-приёмы,
 * округление итогов до целых рублей (Фаза 14).
 */
@DisplayName("PerUserSummaryCalculator (сводка на человека)")
class PerUserSummaryCalculatorTest {

    private final PerUserSummaryCalculator calculator = new PerUserSummaryCalculator();

    private SummaryService.ShoppingComputation computation(BigDecimal totalPlanned,
                                                           BigDecimal totalActual,
                                                           int personMeals,
                                                           BigDecimal calories) {
        ShoppingItemResponse item = new ShoppingItemResponse(
                100L, "Гречневая крупа", UnitOfMeasure.KG,
                new BigDecimal("12"), new BigDecimal("83.33"), new BigDecimal("75.00"),
                new BigDecimal("1000.00"), new BigDecimal("900.00"),
                false, true, null, null, null, null, null);
        ShoppingListResponse list = new ShoppingListResponse(List.of(item),
                totalPlanned, totalActual, new BigDecimal("-10.00"), 0, false, List.of());
        return new SummaryService.ShoppingComputation(list, List.of(), personMeals, calories);
    }

    @Test
    @DisplayName("позиция: amount/cost делятся на defaultPeople (scale 3/2) и на personMeals; итоги — целые рубли")
    void perPersonDivisions() {
        Trip trip = new Trip();
        trip.setId(1L);
        trip.setDefaultPeople(4);

        PersonSummaryResponse resp = calculator.summarize(
                trip, computation(new BigDecimal("1000.00"), new BigDecimal("900.00"),
                        24, new BigDecimal("7200")));

        PersonSummaryResponse.PersonIngredientResponse ing = resp.ingredients().get(0);
        assertThat(ing.amountPerDefaultPerson()).isEqualByComparingTo("3.000");   // 12/4
        assertThat(ing.amountPerPersonMeal()).isEqualByComparingTo("0.500");      // 12/24
        assertThat(ing.plannedCostPerDefaultPerson()).isEqualByComparingTo("250.00");
        assertThat(ing.actualCostPerDefaultPerson()).isEqualByComparingTo("225.00");
        assertThat(ing.plannedCostPerPersonMeal()).isEqualByComparingTo("41.67"); // 1000/24
        assertThat(ing.actualCostPerPersonMeal()).isEqualByComparingTo("37.50");

        var ts = resp.tripSummary();
        assertThat(ts.totalPlannedCost()).isEqualByComparingTo("1000.00");
        assertThat(ts.plannedCostPerDefaultPerson()).isEqualByComparingTo("250"); // roundToRub
        assertThat(ts.plannedCostPerPersonMeal()).isEqualByComparingTo("42");     // roundToRub(41.67)
        assertThat(ts.actualCostPerPersonMeal()).isEqualByComparingTo("38");      // roundToRub(37.50)
        assertThat(ts.caloriesPerPersonMeal()).isEqualByComparingTo("300");       // 7200/24
        assertThat(ts.totalPersonMeals()).isEqualTo(24);
    }

    @Test
    @DisplayName("personMeals = 0 → per-meal суммы ZERO, калории null (без деления на ноль)")
    void zeroPersonMealsSafe() {
        Trip trip = new Trip();
        trip.setId(1L);
        trip.setDefaultPeople(4);

        PersonSummaryResponse resp = calculator.summarize(
                trip, computation(new BigDecimal("1000.00"), new BigDecimal("900.00"),
                        0, BigDecimal.ZERO));

        var ts = resp.tripSummary();
        assertThat(ts.plannedCostPerPersonMeal()).isEqualByComparingTo("0");
        assertThat(ts.actualCostPerPersonMeal()).isEqualByComparingTo("0");
        assertThat(ts.caloriesPerPersonMeal()).isNull();
        assertThat(resp.ingredients().get(0).amountPerPersonMeal()).isEqualByComparingTo("0");
        assertThat(resp.ingredients().get(0).plannedCostPerPersonMeal()).isNull();
    }
}
