package com.provision.dto.ingredient;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record IngredientResponse(
    Long id,
    String code,
    String name,
    UnitOfMeasure unit,
    String unitLabel,
    String category,
    BigDecimal kcalPer100g,
    BigDecimal pieceWeightG,
    LocalDateTime createdAt
) {}
