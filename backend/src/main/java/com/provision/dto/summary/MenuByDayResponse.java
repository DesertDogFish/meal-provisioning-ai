package com.provision.dto.summary;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.util.List;

public record MenuByDayResponse(
    String dayDate,
    Integer effectivePeople,
    List<MenuMealResponse> meals
) {
    public record MenuMealResponse(
        String mealType,
        String recipeName,
        Integer servings,
        List<MenuIngredientResponse> ingredients
    ) {
        public record MenuIngredientResponse(
            String name,
            BigDecimal amount,
            UnitOfMeasure unit
        ) {}
    }
}
