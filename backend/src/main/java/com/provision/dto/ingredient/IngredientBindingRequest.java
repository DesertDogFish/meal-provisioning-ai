package com.provision.dto.ingredient;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record IngredientBindingRequest(
    @NotNull
    String externalCode,
    
    @DecimalMin(value = "0.0001")
    BigDecimal packSize,
    
    String packUnit,
    
    Boolean roundToPacks
) {}
