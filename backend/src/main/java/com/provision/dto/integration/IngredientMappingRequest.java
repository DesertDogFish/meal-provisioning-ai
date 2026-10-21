package com.provision.dto.integration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record IngredientMappingRequest(
    @NotBlank
    String provider,
    
    @NotBlank
    String externalCode,
    
    @NotNull
    BigDecimal packAmount,
    
    @NotBlank
    String packUnit
) {}
