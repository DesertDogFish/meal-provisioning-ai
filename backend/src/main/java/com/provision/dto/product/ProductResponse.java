package com.provision.dto.product;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

public record ProductResponse(
    Long id,
    String name,
    ProductCategoryDto category,
    UnitOfMeasure unit,
    String unitLabel,
    BigDecimal packSize,
    Boolean roundToPacks,
    BigDecimal kcalPer100g,
    BigDecimal pieceWeightG,
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
    
    public static final Map<UnitOfMeasure, String> UNIT_LABELS = Map.of(
        UnitOfMeasure.KG, "кг",
        UnitOfMeasure.L, "л",
        UnitOfMeasure.PCS, "шт",
        UnitOfMeasure.PACK, "уп"
    );
}
