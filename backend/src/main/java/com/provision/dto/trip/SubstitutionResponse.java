package com.provision.dto.trip;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SubstitutionResponse(
    Long id,
    Long recipeId,
    String recipeName,
    Long fromIngredientId,
    String fromIngredientName,
    Long toIngredientId,
    String toIngredientName,
    BigDecimal ratio,
    String comment,
    String createdByEmail,
    LocalDateTime createdAt
) {}
