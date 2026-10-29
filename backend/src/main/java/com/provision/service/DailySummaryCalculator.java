package com.provision.service;

import com.provision.dto.summary.MenuByDayResponse;
import com.provision.entity.Recipe;
import com.provision.entity.Trip;

import java.math.BigDecimal;
import java.util.List;

/**
 * Подзадача 12 (план plans/done/2026-10-29-full-audit.md): меню по дням — дневная сводка
 * (день → люди → блюда → ингредиенты с масштабированными количествами).
 * Граф похода и гидратация рецептов — на стороне SummaryService (loadCalculationContext).
 */
final class DailySummaryCalculator {

    /** Меню по дням для загруженного (и гидратированного) графа похода. */
    List<MenuByDayResponse> menuByDays(Trip trip) {
        return trip.getDays().stream()
                .map(day -> {
                    int effectivePeople = MealPlanCalculator.calculateEffectivePeople(trip, day, null);
                    List<MenuByDayResponse.MenuMealResponse> meals = day.getMeals().stream()
                            .map(meal -> {
                                int mealPeople = MealPlanCalculator.calculateEffectivePeople(trip, day, meal);
                                Recipe recipe = meal.getRecipe();
                                
                                List<MenuByDayResponse.MenuMealResponse.MenuIngredientResponse> ingredients = 
                                        recipe.getIngredients().stream()
                                                .map(ri -> {
                                                    BigDecimal amount = MealPlanCalculator.calculateAmountForMeal(
                                                            ri.getAmount(),
                                                            recipe.getBaseServings(),
                                                            mealPeople
                                                    );
                                                    return new MenuByDayResponse.MenuMealResponse.MenuIngredientResponse(
                                                            ri.getIngredient().getName(),
                                                            amount,
                                                            ri.getIngredient().getUnit()
                                                    );
                                                })
                                                .toList();

                                return new MenuByDayResponse.MenuMealResponse(
                                        meal.getMealType().name(),
                                        recipe.getName(),
                                        mealPeople,
                                        ingredients
                                );
                            })
                            .toList();

                    return new MenuByDayResponse(
                            day.getDayDate().toString(),
                            effectivePeople,
                            meals
                    );
                })
                .toList();
    }
}
