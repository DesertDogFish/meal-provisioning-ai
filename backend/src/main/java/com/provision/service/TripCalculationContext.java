package com.provision.service;

import com.provision.entity.Recipe;

import java.util.Map;

/**
 * Всё, что нужно для любой агрегации похода: загруженные одним пакетом
 * (JOIN FETCH) составы рецептов и правки состава похода.
 * FIX P1: при open-in-view:false ленивые recipe.ingredients / ri.ingredient
 * иначе грузились по одному запросу на блюдо/ингредиент (классическое N+1),
 * а self-invocation getShoppingList из getPersonSummary обходил прокси
 * @Transactional. Теперь вся загрузка — в одном транзакционном методе.
 */
record TripCalculationContext(Map<Long, Recipe> recipesById,
                                      TripIngredientEditService.TripEditBundle edits) {}
