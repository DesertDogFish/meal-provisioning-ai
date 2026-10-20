package com.provision.dto.summary;

import java.math.BigDecimal;
import java.util.List;

public record DayShoppingResponse(
    String dayDate,
    List<ShoppingItemResponse> items,
    BigDecimal plannedCost,
    BigDecimal actualCost,
    boolean hasMissingPrices
) {}
