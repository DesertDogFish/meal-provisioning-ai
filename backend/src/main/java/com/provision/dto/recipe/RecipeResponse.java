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
    String category,
    Integer cookMinutes,
    Integer baseServings,
    Integer caloriesPerServing,
    BigDecimal calculatedCaloriesPerServing,
    List<String> missingKcalIngredients,
    RecipeSource source,
    List<RecipeIngredientResponse> ingredients,
    LocalDateTime createdAt
) {
    public record RecipeIngredientResponse(
        Long ingredientId,
        String ingredientName,
        UnitOfMeasure unit,
        String unitLabel,
        BigDecimal amount,
        // Fix-2 (список 26.10, п.3/4): категория и фасовка продукта — нужны фронту
        // для группировки чека/чеклиста и расчёта упаковок в real-режиме без
        // админского /admin/products. Паритет: mock отдаёт их вложенным объектом
        // ingredient (category/packSize/roundToPacks/pieceWeightG/kcalPer100g),
        // фронтовая normalizeRecipe собирает из плоских полей тот же объект.
        String categoryName,
        BigDecimal packSize,
        Boolean roundToPacks,
        BigDecimal pieceWeightG,
        BigDecimal kcalPer100g
    ) {}
}
