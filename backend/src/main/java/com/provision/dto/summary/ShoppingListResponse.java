package com.provision.dto.summary;

import java.math.BigDecimal;
import java.util.List;

public record ShoppingListResponse(
    List<ShoppingItemResponse> items,
    BigDecimal totalPlannedCost,
    BigDecimal totalActualCost,
    BigDecimal deltaPercent,
    Integer overriddenCount,
    boolean hasMissingPrices,
    List<String> missingIngredients
) {}
