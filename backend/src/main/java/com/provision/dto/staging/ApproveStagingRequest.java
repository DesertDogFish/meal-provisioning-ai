package com.provision.dto.staging;

import com.provision.entity.MealType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

public record ApproveStagingRequest(
    @NotBlank
    String name,
    
    @NotNull
    MealType mealType,
    
    @NotNull
    Integer baseServings,
    
    Integer caloriesPerServing,
    
    @NotEmpty @Valid
    List<ApprovedIngredient> ingredients
) {
    public record ApprovedIngredient(
        @NotNull
        Long ingredientId,
        
        @NotNull
        BigDecimal amount
    ) {}
}
