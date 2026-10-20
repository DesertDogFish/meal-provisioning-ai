package com.provision.dto.summary;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;

public record ShoppingItemResponse(
    Long ingredientId,
    String ingredientName,
    UnitOfMeasure unit,
    BigDecimal totalAmount,
    BigDecimal plannedUnitPrice,
    BigDecimal actualUnitPrice,
    BigDecimal plannedCost,
    BigDecimal actualCost,
    boolean overridden,
    boolean hasPlannedPrice
) {}
