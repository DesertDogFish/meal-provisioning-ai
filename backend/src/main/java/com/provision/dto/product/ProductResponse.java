package com.provision.dto.product;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record ProductResponse(
    Long id,
    String name,
    ProductCategoryDto category,
    UnitOfMeasure unit,
    BigDecimal packSize,
    Boolean roundToPacks,
    BigDecimal caloriesPerUnit,
    String description,
    CurrentPriceDto currentPrice,
    Integer usageRecipes,
    String bindingStatus,
    LocalDateTime updatedAt
) {
    public record CurrentPriceDto(
        BigDecimal value,
        String currency,
        LocalDate effectiveFrom,
        String source
    ) {}
}
