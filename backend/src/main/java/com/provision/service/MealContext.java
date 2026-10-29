package com.provision.service;

import com.provision.entity.Recipe;
import com.provision.entity.Trip;
import com.provision.entity.TripDay;
import com.provision.entity.TripMeal;

/**
 * Контекст приёма пищи, загруженный для расчёта/правок состава
 * (подзадача 11: общий тип для {@link MealCompositionService}, {@link CompositionDiffEngine}
 * и {@link TripScopedIdResolver}).
 *
 * @param recipe гидратированный рецепт (с ингредиентами; для похода — trip-снепшот рецепта)
 * @param people эффективное число людей приёма (SummaryService.calculateEffectivePeople)
 */
record MealContext(Trip trip, TripDay day, TripMeal meal, Recipe recipe, int people) {
}
