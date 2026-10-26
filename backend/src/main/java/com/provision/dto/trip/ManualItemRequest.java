package com.provision.dto.trip;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * Fix-2 (U40 / PLAN R3): создание ручной позиции закупки.
 * dayId = null — позиция ко всему походу; amount — абсолют в единицах продукта.
 */
public record ManualItemRequest(
    Long dayId,

    @NotNull
    Long ingredientId,

    @NotNull
    @DecimalMin(value = "0.0", inclusive = false)
    BigDecimal amount,

    @Size(max = 255)
    String note
) {}
