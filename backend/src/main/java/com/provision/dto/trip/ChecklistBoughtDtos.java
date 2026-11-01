package com.provision.dto.trip;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * KB-15: контракт серверных отметок «взято» в чеклисте похода.
 *
 * GET /api/v1/trips/{tripId}/checklist-bought -> [{ingredientId, neededStamp}]
 * PUT тот же путь, body {items:[{ingredientId, neededStamp}]} -> актуальный массив.
 * PUT — идемпотентная полная замена набора (как в shopping-exclusions).
 */
public final class ChecklistBoughtDtos {

    private ChecklistBoughtDtos() {}

    /**
     * Одна отметка: продукт + штамп потребности, на которой сделана отметка.
     *
     * neededStamp — та же величина, что клиентский ключ отметки
     * {@code checklistRowKey = round(needed * 1000)} (utils/checklist.ts), т.е.
     * потребность позиции в базовых единицах с точностью до 0.001. Ноль —
     * ЛЕГИТИМНОЕ значение: у позиции с нулевой потребностью (специя < 0,5 г и
     * т.п.) штамп равен 0, и такой PUT обязан приниматься ({@code @PositiveOrZero}),
     * иначе клиент навсегда залипает в несинхронизированном состоянии.
     * Отрицательные значения невалидны; дробные не проходят, т.к. тип Long.
     */
    public record Item(
            @NotNull Long ingredientId,
            @NotNull @PositiveOrZero Long neededStamp
    ) {}

    /**
     * Тело PUT: полный желаемый набор отметок.
     * items ограничен 2000 элементами — защита от раздутого payload/усилия
     * полной замены; пустой список допустим (очистка набора).
     */
    public record ItemsBody(
            @NotNull @Size(max = 2000) List<@Valid Item> items
    ) {}
}
