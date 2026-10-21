package com.provision.dto.ingredient;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public record IngredientPriceRequest(
    @NotNull
    Long ingredientId,
    
    @NotNull @PositiveOrZero
    BigDecimal pricePerUnit,
    
    @NotNull
    LocalDate effectiveFrom,
    
    @Size(min = 3, max = 3)
    String currency
) {
    public IngredientPriceRequest {
        if (currency == null) currency = "RUB";
    }
}
