package com.provision.service;

import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Подзадача 11 (план plans/2026-10-29-full-audit.md): чистая математика состава блюда —
 * вес в граммах, ккал, план-стоимость. Без репозиториев и Spring-зависимостей;
 * конвертация единиц — через {@link UnitOfMeasure} (подзадача 21).
 *
 * <p>Округление (эталон FORM-meal-composition-spec §4.4):
 * <ul>
 *   <li>ккал строки — scale 6 HALF_UP (суммируем точно, округление до 0,1 — только в ответе);</li>
 *   <li>стоимость — scale 2 HALF_UP (копейки);</li>
 *   <li>вес — без округления (scale 1 только в Totals ответа).</li>
 * </ul>
 */
final class CompositionCalculator {

    /** Знаменатель питательности: ккал заданы НА 100 ГРАММОВ. */
    private static final BigDecimal PER_100G = BigDecimal.valueOf(100);

    private CompositionCalculator() {
    }

    /** Значение по умолчанию для ratio правки: 1 (правка количество не меняет). */
    static BigDecimal nvl(BigDecimal v) {
        return v == null ? BigDecimal.ONE : v;
    }

    /**
     * Граммы позиции: конвертация — в {@link UnitOfMeasure#toGrams} (KG/L → ×1000;
     * PCS/PACK → qty × piece_weight_g). Неизвестная конвертация (PCS/PACK без веса
     * штуки) и null-unit исторически дают 0 — null-unit трактуем как PCS.
     */
    static BigDecimal weightOfGrams(BigDecimal qty, UnitOfMeasure unit, BigDecimal pieceWeightG) {
        if (qty == null) return BigDecimal.ZERO;
        UnitOfMeasure effective = unit != null ? unit : UnitOfMeasure.PCS;
        BigDecimal grams = effective.toGrams(qty, pieceWeightG);
        return grams != null ? grams : BigDecimal.ZERO;
    }

    /** Ккал позиции: kcalPer100g × граммы / 100 (scale 6 — без преждевременного округления). */
    static BigDecimal kcalOf(BigDecimal qty, UnitOfMeasure unit, BigDecimal kcalPer100g,
                             BigDecimal pieceWeightG) {
        if (kcalPer100g == null) return BigDecimal.ZERO;
        return weightOfGrams(qty, unit, pieceWeightG)
                .multiply(kcalPer100g)
                .divide(PER_100G, 6, RoundingMode.HALF_UP);
    }

    /**
     * План-стоимость позиции: qty × unitPrice, копейки (scale 2 HALF_UP).
     *
     * @return стоимость либо {@code null}, если цена неизвестна (qty/unitPrice == null) —
     *         вызывающий НЕ добавляет такую позицию в plannedCost (цена дня не назначена)
     */
    static BigDecimal costOf(BigDecimal qty, BigDecimal unitPrice) {
        if (qty == null || unitPrice == null) return null;
        return qty.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP);
    }
}
