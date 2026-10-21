package com.provision.dto.ingredient;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record IngredientPriceResponse(
    Long id,
    Long ingredientId,
    String ingredientName,
    BigDecimal pricePerUnit,
    String currency,
    LocalDate effectiveFrom,
    LocalDateTime createdAt
) {}
