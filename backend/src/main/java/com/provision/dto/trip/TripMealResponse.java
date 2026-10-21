package com.provision.dto.trip;

import com.provision.entity.MealType;

public record TripMealResponse(
    Long id,
    MealType mealType,
    Long recipeId,
    String recipeName,
    Integer peopleOverride,
    Integer sortOrder
) {}
