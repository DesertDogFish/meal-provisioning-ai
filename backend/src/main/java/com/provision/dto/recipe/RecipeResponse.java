package com.provision.dto.recipe;

import com.provision.entity.MealType;
import com.provision.entity.RecipeSource;
import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record RecipeResponse(
    Long id,
    String name,
    MealType mealType,
    Integer baseServings,
    Integer caloriesPerServing,
    RecipeSource source,
    List<RecipeIngredientResponse> ingredients,
    LocalDateTime createdAt
) {
    public record RecipeIngredientResponse(
        Long ingredientId,
        String ingredientName,
        UnitOfMeasure unit,
        BigDecimal amount
    ) {}
}
