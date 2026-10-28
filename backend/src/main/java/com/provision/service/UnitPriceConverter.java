package com.provision.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Пересчёт цены фасовки внешнего провайдера в цену за единицу внутреннего продукта.
 *
 * <p>Fix-16: математика вынесена из синхронизации цен в отдельный модуль (R9) —
 * это самостоятельная ответственность «привести единицы измерения», она не зависит
 * ни от транзакций, ни от провайдеров, и её удобно проверять изолированно.</p>
 *
 * <p>Правила (совпадают с ARCHITECTURE, секция цен):</p>
 * <ul>
 *   <li>несовместимые единицы (например «шт» → «кг») → {@code null}, точка цены
 *       отбрасывается и попадает в {@code reason} детали синка как «отброшено»;</li>
 *   <li>вес/объём приводятся парами G↔KG и ML↔L, регистр не важен;</li>
 *   <li>результат — 2 знака, HALF_UP (копейки), как в {@code ingredient_prices}.</li>
 * </ul>
 */
public final class UnitPriceConverter {

    private static final BigDecimal THOUSAND = BigDecimal.valueOf(1000);

    private UnitPriceConverter() {}

    /**
     * Цена за единицу продукта из цены упаковки.
     * Пример: 89.99 ₽ за 900 г при единице продукта KG → 99.99 ₽/KG.
     *
     * @param packPrice      цена фасовки у провайдера
     * @param packAmount     размер фасовки (null/≤0 → {@code null})
     * @param packUnit       единица фасовки провайдера
     * @param ingredientUnit единица внутреннего продукта
     * @return цена за единицу продукта либо {@code null}, если пересчёт невозможен
     */
    public static BigDecimal unitPrice(BigDecimal packPrice, BigDecimal packAmount,
                                       String packUnit, String ingredientUnit) {
        if (packPrice == null || packAmount == null || packAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }

        BigDecimal packAmountInIngredientUnit = convert(packAmount, packUnit, ingredientUnit);
        if (packAmountInIngredientUnit == null
                || packAmountInIngredientUnit.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }

        return packPrice.divide(packAmountInIngredientUnit, 2, RoundingMode.HALF_UP);
    }

    /**
     * Перевод количества между единицами веса/объёма.
     *
     * @return значение в целевой единице либо {@code null}, если единицы несовместимы
     */
    public static BigDecimal convert(BigDecimal amount, String fromUnit, String toUnit) {
        if (amount == null || fromUnit == null || toUnit == null) {
            return null;
        }

        String from = fromUnit.toUpperCase();
        String to = toUnit.toUpperCase();

        if (from.equals(to)) {
            return amount;
        }

        // Конвертация веса
        if (from.equals("G") && to.equals("KG")) {
            return amount.divide(THOUSAND, 6, RoundingMode.HALF_UP);
        } else if (from.equals("KG") && to.equals("G")) {
            return amount.multiply(THOUSAND);
        }

        // Конвертация объёма
        if (from.equals("ML") && to.equals("L")) {
            return amount.divide(THOUSAND, 6, RoundingMode.HALF_UP);
        } else if (from.equals("L") && to.equals("ML")) {
            return amount.multiply(THOUSAND);
        }

        // Если единицы несовместимы, возвращаем null
        return null;
    }
}
