package com.provision.service;

import com.provision.dto.summary.PersonSummaryResponse;
import com.provision.dto.summary.ShoppingListResponse;
import com.provision.dto.summary.TripSummaryResponse;
import com.provision.entity.Trip;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Подзадача 12 (план plans/done/2026-10-29-full-audit.md): сводка «на человека» —
 * деление итогов закупки на defaultPeople и на число человеко-приёмов, сборка
 * PersonSummaryResponse/TripSummaryResponse. Расчёт закупки не повторяется:
 * вход — готовый ShoppingComputation из ShoppingListCalculator.
 *
 * <p>Фаза 14: все ИТОГОВЫЕ суммы — целые рубли; промежуточный расчёт (позиции,
 * цены за ед.) остаётся точным. Деление на людей идёт от точного total до округления.
 */
final class PerUserSummaryCalculator {

    PersonSummaryResponse summarize(Trip trip, SummaryService.ShoppingComputation computation) {
        ShoppingListResponse shoppingList = computation.shoppingList();
        final int finalTotalPersonMeals = computation.totalPersonMeals();
        final BigDecimal finalTotalCalories = computation.totalCalories();

        List<PersonSummaryResponse.PersonIngredientResponse> ingredients = shoppingList.items().stream()
                .map(item -> {
                    BigDecimal amountPerDefaultPerson = item.totalAmount()
                            .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 3, RoundingMode.HALF_UP);
                    
                    BigDecimal amountPerPersonMeal = finalTotalPersonMeals > 0
                            ? item.totalAmount().divide(BigDecimal.valueOf(finalTotalPersonMeals), 3, RoundingMode.HALF_UP)
                            : BigDecimal.ZERO;
                    
                    BigDecimal plannedCostPerDefaultPerson = item.plannedCost() != null
                            ? item.plannedCost().divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal actualCostPerDefaultPerson = item.actualCost() != null
                            ? item.actualCost().divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal plannedCostPerPersonMeal = item.plannedCost() != null && finalTotalPersonMeals > 0
                            ? item.plannedCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal actualCostPerPersonMeal = item.actualCost() != null && finalTotalPersonMeals > 0
                            ? item.actualCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    return new PersonSummaryResponse.PersonIngredientResponse(
                            item.ingredientName(),
                            item.unit(),
                            amountPerDefaultPerson,
                            amountPerPersonMeal,
                            plannedCostPerDefaultPerson,
                            actualCostPerDefaultPerson,
                            plannedCostPerPersonMeal,
                            actualCostPerPersonMeal
                    );
                })
                .toList();

        // Фаза 14: все ИТОГОВЫЕ суммы — целые рубли; промежуточный расчёт (позиции, цены за ед.)
        // остаётся точным. Деление на людей идёт от точного total до округления.
        BigDecimal plannedCostPerDefaultPerson = MealPlanCalculator.roundToRub(shoppingList.totalPlannedCost()
                .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP));

        BigDecimal actualCostPerDefaultPerson = MealPlanCalculator.roundToRub(shoppingList.totalActualCost()
                .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP));

        BigDecimal plannedCostPerPersonMeal = finalTotalPersonMeals > 0
                ? MealPlanCalculator.roundToRub(shoppingList.totalPlannedCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP))
                : BigDecimal.ZERO;

        BigDecimal actualCostPerPersonMeal = finalTotalPersonMeals > 0
                ? MealPlanCalculator.roundToRub(shoppingList.totalActualCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP))
                : BigDecimal.ZERO;
        
        BigDecimal caloriesPerPersonMeal = finalTotalPersonMeals > 0
                ? finalTotalCalories.divide(BigDecimal.valueOf(finalTotalPersonMeals), 0, RoundingMode.HALF_UP)
                : null;

        TripSummaryResponse tripSummary = new TripSummaryResponse(
                shoppingList.totalPlannedCost(),
                shoppingList.totalActualCost(),
                shoppingList.deltaPercent(),
                shoppingList.overriddenCount(),
                shoppingList.hasMissingPrices(),
                shoppingList.missingIngredients(),
                finalTotalPersonMeals,
                plannedCostPerDefaultPerson,
                actualCostPerDefaultPerson,
                plannedCostPerPersonMeal,
                actualCostPerPersonMeal,
                caloriesPerPersonMeal
        );

        return new PersonSummaryResponse(ingredients, tripSummary);
    }
}
