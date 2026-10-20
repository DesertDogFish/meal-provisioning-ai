package com.provision.dto.summary;

import java.math.BigDecimal;
import java.util.List;

public record TripSummaryResponse(
    BigDecimal totalCost,
    boolean hasMissingPrices,
    List<String> missingIngredients,
    Integer totalPersonMeals,
    BigDecimal costPerDefaultPerson,
    BigDecimal costPerPersonMeal,
    BigDecimal caloriesPerPersonMeal
) {}
