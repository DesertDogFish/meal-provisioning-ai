package com.provision.dto.staging;

import com.provision.entity.MealType;
import com.provision.entity.RecipeSource;

import java.time.LocalDateTime;
import java.util.Map;

public record StagingRecipeResponse(
    Long id,
    RecipeSource source,
    Map<String, Object> rawPayload,
    String status,
    String suggestedName,
    MealType suggestedMealType,
    Map<String, Object> suggestedIngredients,
    LocalDateTime reviewedAt,
    String reviewedByEmail,
    String rejectionReason,
    LocalDateTime createdAt
) {}
