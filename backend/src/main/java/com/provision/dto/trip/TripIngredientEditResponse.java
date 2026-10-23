package com.provision.dto.trip;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record TripIngredientEditResponse(
    Long id,
    Long recipeId,
    String recipeName,
    Long fromIngredientId,
    String fromIngredientName,
    Long toIngredientId,        // null = позиция удалена из расчёта в рамках похода
    String toIngredientName,
    BigDecimal ratio,
    BigDecimal amountPerServing,
    boolean added,              // true = добавлена руками (не из рецепта)
    boolean removed,            // true = мягко удалена из расчёта
    String comment,
    LocalDateTime createdAt
) {}
