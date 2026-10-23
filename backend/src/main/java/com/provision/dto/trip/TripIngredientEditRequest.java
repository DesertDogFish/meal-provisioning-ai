package com.provision.dto.trip;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * Единый запрос пер-походной правки состава блюда (Фаза 14, N3):
 *  - замена: fromIngredientId + toIngredientId (+ratio);
 *  - добавление руками: fromIngredientId = null, toIngredientId + amountPerServing;
 *  - удаление «в рамках похода»: toIngredientId = null (from обязателен).
 * Хранится в trip_ingredient_substitutions (added/removed флаги), исходный
 * рецепт в каталоге не трогается.
 */
public record TripIngredientEditRequest(
    @NotNull
    Long recipeId,

    Long fromIngredientId,

    Long toIngredientId,

    @DecimalMin(value = "0.0001")
    BigDecimal ratio,

    @DecimalMin(value = "0")
    BigDecimal amountPerServing,

    @Size(max = 500)
    String comment
) {}
