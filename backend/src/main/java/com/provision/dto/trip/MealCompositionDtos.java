package com.provision.dto.trip;

import com.provision.entity.MealType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * FORM-meal-composition-spec §4.2: контракт эндпоинтов состава приёма пищи.
 * GET /trips/{t}/meals/{m}/composition и PUT того же пути (атомарный batch-коммит модалки B).
 */
public final class MealCompositionDtos {

    private MealCompositionDtos() {}

    /** Ответ GET composition: всё масштабирование считает сервер, клиент не делит и не умножает. */
    public record CompositionResponse(
            Long mealId,
            LocalDate dayDate,
            MealType mealType,
            int people,
            int baseServings,
            Long recipeId,
            String recipeName,
            List<Item> items,
            List<Substitution> substitutions,
            Totals totals
    ) {
        /**
         * Строка состава. state: RECIPE | SCALED | EXTRA | EXCLUDED.
         *  - baseAmountPerServing — из рецепта (null для EXTRA);
         *  - derivedAmount — base/baseServings×people×ratio (null для EXTRA/EXCLUDED);
         *  - effectiveAmount — итог на приём (0 для EXCLUDED);
         *  - ratio — только для SCALED; substitutedFrom — имя from-продукта для строки-получателя замены.
         */
        public record Item(
                Long ingredientId,
                String name,
                String unit,
                BigDecimal packSize,
                BigDecimal pieceWeightG,
                BigDecimal kcalPer100g,
                BigDecimal baseAmountPerServing,
                BigDecimal derivedAmount,
                BigDecimal effectiveAmount,
                String state,
                BigDecimal ratio,
                String substitutedFrom,
                BigDecimal kcalTotal
        ) {}

        public record Substitution(
                Long id,
                Long fromIngredientId,
                String fromName,
                Long toIngredientId,
                String toName,
                BigDecimal ratio
        ) {}

        /** kcal — ккал на приём; weightGrams — вес позиций кг/L→г, PCS/PACK через piece_weight_g; ₽ scale 2. */
        public record Totals(BigDecimal kcal, BigDecimal weightGrams, BigDecimal plannedCost) {}
    }

    /** Тело PUT composition: полный желаемый диф-состав (сервер сам удалит лишние правки). */
    public record CompositionPutRequest(
            @Valid List<@NotNull ItemDto> items,
            @Valid List<SubstitutionDto> substitutions
    ) {
        public record ItemDto(
                @NotNull Long ingredientId,
                /** RECIPE | SCALED | EXTRA | EXCLUDED */
                @NotNull String state,
                /** обязательно (>0) для EXTRA */
                BigDecimal amount,
                /** обязательно (>0) для SCALED */
                BigDecimal ratio
        ) {}

        public record SubstitutionDto(
                @NotNull Long fromIngredientId,
                @NotNull Long toIngredientId,
                BigDecimal ratio
        ) {}
    }
}
