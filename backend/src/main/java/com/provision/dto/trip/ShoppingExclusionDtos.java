package com.provision.dto.trip;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

/**
 * Fix-5 / PLAN R2 (шаг 2): контракт исключений закупки с по-дневной областью.
 *
 * PUT /trips/{id}/shopping-exclusions принимает ОБЕ формы (идемпотентная замена
 * всего набора):
 *  - items: [{ingredientId, dayDate|null}] — каноническая форма;
 *  - ingredientIds: [Long] — legacy-форма (все исключения глобальные).
 *
 * GET отдаёт список ExclusionItem (dayDate=null — глобальное).
 */
public final class ShoppingExclusionDtos {

    private ShoppingExclusionDtos() {}

    /** Одна исключённая позиция: ingredientId + dayDate (null = весь поход). */
    public record ExclusionItem(
            @NotNull Long ingredientId,
            LocalDate dayDate
    ) {}

    /** Тело PUT: ingredientIds (legacy) и/или items (канон). */
    public record ExclusionsBody(
            List<Long> ingredientIds,
            List<ExclusionItem> items
    ) {}
}
