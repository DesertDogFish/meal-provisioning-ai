package com.provision.dto.trip;

import com.provision.entity.MealType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record TripMealRequest(
    @NotNull
    MealType mealType,
    
    @NotNull
    Long recipeId,
    
    @Min(1)
    Integer peopleOverride,
    
    Integer sortOrder
) {
    public TripMealRequest {
        if (sortOrder == null) sortOrder = 0;
    }
}
