package com.provision.dto.summary;

import java.math.BigDecimal;
import java.util.List;

public record ShoppingListResponse(
    List<ShoppingItemResponse> items,
    BigDecimal totalCost,
    boolean hasMissingPrices,
    List<String> missingIngredients
) {}
