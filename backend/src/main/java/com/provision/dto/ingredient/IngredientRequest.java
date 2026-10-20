package com.provision.dto.ingredient;

import com.provision.entity.UnitOfMeasure;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record IngredientRequest(
    @Size(min = 1, max = 64)
    String code,
    
    @NotBlank @Size(min = 1, max = 255)
    String name,
    
    @NotNull
    UnitOfMeasure unit,
    
    @NotBlank @Size(min = 1, max = 100)
    String category,
    
    BigDecimal caloriesPerUnit
) {}
