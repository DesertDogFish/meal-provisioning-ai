package com.provision.dto.staging;

import com.provision.entity.MealType;
import com.provision.entity.RecipeSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Map;

public record StagingRecipeRequest(
    @NotNull
    RecipeSource source,
    
    @NotNull
    Map<String, Object> rawPayload,
    
    @NotBlank
    String suggestedName,
    
    MealType suggestedMealType,
    
    Map<String, Object> suggestedIngredients
) {}
