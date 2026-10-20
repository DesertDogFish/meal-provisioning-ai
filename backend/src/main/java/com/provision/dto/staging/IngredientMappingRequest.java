package com.provision.dto.staging;

import com.provision.entity.RecipeSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record IngredientMappingRequest(
    @NotBlank
    String externalName,
    
    @NotNull
    RecipeSource source,
    
    @NotNull
    Long internalIngredientId
) {}
