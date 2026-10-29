package com.provision.util;

import com.provision.entity.Ingredient;
import com.provision.entity.RecipeIngredient;
import com.provision.entity.UnitOfMeasure;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.List;

/**
 * CR-1: Расчёт калорийности по формуле ядра
 * grams = amount × (KG|L → 1000; PCS|PACK → piece_weight_g)
 * kcal = grams / 100 × kcal_per_100g
 */
public class KcalCalculator {
    
    private static final MathContext MC = new MathContext(6, RoundingMode.HALF_UP);

    /** Знаменатель питательности: ккал заданы НА 100 ГРАММОВ. */
    private static final BigDecimal PER_100G = BigDecimal.valueOf(100);
    
    /**
     * Рассчитать ккал для одного ингредиента в рецепте
     * @param ingredient продукт
     * @param amount количество в базовых единицах (кг, л, шт, уп)
     * @return ккал или null если нет данных для расчёта
     */
    public static BigDecimal calculateKcal(Ingredient ingredient, BigDecimal amount) {
        if (ingredient == null || amount == null) return null;
        if (ingredient.getKcalPer100g() == null) return null;
        
        UnitOfMeasure unit = ingredient.getUnit();
        if (unit == null) return null;

        // Конвертация — в UnitOfMeasure: KG/L → ×GRAMS_PER_KG; PCS/PACK → ×piece_weight_g
        // (null, если вес штуки не задан/неположителен — считаем ккал неизвестными).
        BigDecimal per = unit.gramsPerOne(ingredient.getPieceWeightG());
        if (per == null) return null;
        BigDecimal grams = amount.multiply(per, MC);

        // kcal = grams / 100 × kcal_per_100g
        return grams.divide(PER_100G, MC)
                   .multiply(ingredient.getKcalPer100g())
                   .setScale(1, RoundingMode.HALF_UP);
    }
    
    /**
     * Рассчитать ккал на порцию рецепта
     * @param ingredients список ингредиентов рецепта
     * @param baseServings базовое количество порций
     * @return результат: рассчитанные ккал, список продуктов без ккал
     */
    public static KcalResult calculateRecipeKcal(List<RecipeIngredient> ingredients, int baseServings) {
        BigDecimal totalKcal = BigDecimal.ZERO;
        java.util.List<String> missingKcal = new java.util.ArrayList<>();
        boolean hasAnyMissing = false;
        
        for (RecipeIngredient ri : ingredients) {
            Ingredient ing = ri.getIngredient();
            BigDecimal kcal = calculateKcal(ing, ri.getAmount());
            
            if (kcal == null) {
                if (ing.getKcalPer100g() == null) {
                    missingKcal.add(ing.getName());
                    hasAnyMissing = true;
                }
                // Если pieceWeightG отсутствует для PCS/PACK — тоже пропускаем
                continue;
            }
            
            totalKcal = totalKcal.add(kcal);
        }
        
        // Делим на количество порций
        BigDecimal perServing = totalKcal.divide(
            BigDecimal.valueOf(baseServings), 1, RoundingMode.HALF_UP);
        
        return new KcalResult(
            hasAnyMissing ? null : perServing,
            missingKcal
        );
    }
    
    public record KcalResult(BigDecimal caloriesPerServing, List<String> missingKcalIngredients) {
        public boolean hasMissingKcal() {
            return caloriesPerServing == null;
        }
    }
    
    /**
     * Humanize количество: 0.8 KG → "800 г", 0.25 L → "250 мл", 2 PCS → "2 шт"
     */
    public static String humanize(BigDecimal amount, UnitOfMeasure unit) {
        if (amount == null) return "—";
        
        switch (unit) {
            case KG:
                if (amount.compareTo(BigDecimal.ONE) < 0) {
                    return amount.multiply(UnitOfMeasure.GRAMS_PER_KG).setScale(0, RoundingMode.HALF_UP) + " г";
                }
                return amount.setScale(2, RoundingMode.HALF_UP) + " кг";
            case L:
                if (amount.compareTo(BigDecimal.ONE) < 0) {
                    return amount.multiply(UnitOfMeasure.GRAMS_PER_KG).setScale(0, RoundingMode.HALF_UP) + " мл";
                }
                return amount.setScale(2, RoundingMode.HALF_UP) + " л";
            case PCS:
                return amount.setScale(0, RoundingMode.HALF_UP) + " шт";
            case PACK:
                return amount.setScale(0, RoundingMode.HALF_UP) + " уп";
            default:
                return amount.toPlainString();
        }
    }
}
