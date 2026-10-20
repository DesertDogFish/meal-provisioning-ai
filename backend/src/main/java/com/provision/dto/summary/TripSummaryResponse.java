package com.provision.dto.summary;

import java.math.BigDecimal;
import java.util.List;

public record TripSummaryResponse(
    BigDecimal totalPlannedCost,
    BigDecimal totalActualCost,
    BigDecimal deltaPercent,
    Integer overriddenCount,
    boolean hasMissingPrices,
    List<String> missingIngredients,
    Integer totalPersonMeals,
    BigDecimal plannedCostPerDefaultPerson,
    BigDecimal actualCostPerDefaultPerson,
    BigDecimal plannedCostPerPersonMeal,
    BigDecimal actualCostPerPersonMeal,
    BigDecimal caloriesPerPersonMeal
) {}
