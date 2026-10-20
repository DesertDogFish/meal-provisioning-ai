package com.provision.dto.trip;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record TripPriceOverrideResponse(
    Long id,
    Long ingredientId,
    String ingredientName,
    BigDecimal actualPrice,
    String currency,
    String comment,
    String updatedByEmail,
    LocalDateTime updatedAt
) {}
