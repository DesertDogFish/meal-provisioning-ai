package com.provision.dto.integration;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Fix-14: текущая привязка внутреннего ингредиента к внешнему товару провайдера.
 * Отдаётся списком через GET /admin/integrations/{provider}/mappings, чтобы UI
 * показывал, что уже связано (боль «якобы маппинг уже есть, хотя хрен знает что
 * там есть»), и давал перепривязать/отвязать.
 */
public record IngredientBindingDto(
    Long mappingId,
    Long ingredientId,
    String ingredientName,
    String externalCode,
    String externalName,
    BigDecimal packAmount,
    String packUnit,
    LocalDateTime createdAt
) {}
