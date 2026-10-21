package com.provision.dto.staging;

import com.provision.entity.RecipeSource;

import java.time.LocalDateTime;

public record IngredientMappingResponse(
    Long id,
    String externalName,
    RecipeSource source,
    Long internalIngredientId,
    String internalIngredientName,
    LocalDateTime createdAt
) {}
