package com.provision.dto.trip;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * FIX (P1, аудит Phase 11): поле ingredientId убрано из тела запроса — оно дублировало
 * @PathVariable в PUT /trips/{tripId}/price-overrides/{ingredientId} и требовалось через
 * @NotNull, что давало 400 при корректном запросе клиента, не присылающего id в теле.
 */
public record TripPriceOverrideRequest(
    @NotNull
    @DecimalMin(value = "0.0", inclusive = true)
    BigDecimal actualPrice,

    @Size(max = 500)
    String comment
) {}
