package com.provision.dto.summary;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;

public record ShoppingItemResponse(
    Long ingredientId,
    String ingredientName,
    UnitOfMeasure unit,
    BigDecimal totalAmount,
    BigDecimal estimatedCost,
    boolean hasPrice
) {}
