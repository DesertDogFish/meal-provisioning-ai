package com.provision.dto.summary;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.util.List;

public record PersonSummaryResponse(
    List<PersonIngredientResponse> ingredients,
    TripSummaryResponse tripSummary
) {
    public record PersonIngredientResponse(
        String ingredientName,
        UnitOfMeasure unit,
        BigDecimal amountPerDefaultPerson,
        BigDecimal amountPerPersonMeal,
        BigDecimal costPerDefaultPerson,
        BigDecimal costPerPersonMeal
    ) {}
}
