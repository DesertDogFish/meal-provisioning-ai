package com.provision.dto.trip;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record TripPriceOverrideRequest(
    @NotNull
    Long ingredientId,
    
    @NotNull
    @DecimalMin(value = "0.0", inclusive = true)
    BigDecimal actualPrice,
    
    @Size(max = 500)
    String comment
) {}
