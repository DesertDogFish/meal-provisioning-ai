package com.provision.dto.trip;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record SubstitutionRequest(
    @NotNull
    Long recipeId,
    
    @NotNull
    Long fromIngredientId,
    
    @NotNull
    Long toIngredientId,
    
    @NotNull @DecimalMin(value = "0.0001")
    BigDecimal ratio,
    
    @Size(max = 500)
    String comment
) {}
