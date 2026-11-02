package com.provision.dto.trip;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/**
 * BL-27: контракт серверного ФАКТИЧЕСКОГО количества в чеклисте похода.
 *
 * <pre>
 * GET /api/v1/trips/{tripId}/checklist-actual-qty      -> [{ingredientId, amount, unit}]
 * PUT /api/v1/trips/{tripId}/checklist-actual-qty      body {items:[...]} -> тот же массив
 * </pre>
 *
 * PUT — идемпотентная полная замена набора (как у «взято»/исключений): клиент шлёт
 * весь факт, сервер удаляет прежние строки похода и вставляет новые. Дубли
 * ingredientId в теле схлопываются (последнее значение выигрывает).
 *
 * amount — в ЧЕЛОВЕЧЕСКОЙ единице ({@code unit}), не в базовых единицах продукта;
 * пара соответствует клиентскому {@code ChecklistActual = {amount, unit}}
 * (utils/tripStaging.ts).
 */
public final class ChecklistActualQtyDtos {

    private ChecklistActualQtyDtos() {}

    /** Одна фактическая позиция: продукт + количество + человеческая единица. */
    public record Item(
            @NotNull Long ingredientId,
            @NotNull @Positive BigDecimal amount,
            @NotBlank @Size(max = 16) String unit
    ) {}

    /** Тело PUT: полный желаемый набор фактов. Пустой список — очистка. */
    public record ItemsBody(
            @NotNull @Size(max = 2000) List<@Valid Item> items
    ) {}
}
