package com.provision.entity;

import java.math.BigDecimal;

/**
 * Локальные единицы измерения продукта.
 *
 * <p>Конвертация количества в граммы живёт ЗДЕСЬ (а не в сервисах) — ядро расчётов
 * питательности оперирует граммами:
 * <ul>
 *   <li>{@code KG} → ×1000 (кг → г);</li>
 *   <li>{@code L} → ×1000 — историческое приближение «1 л ≈ 1 кг» (плотность 1 г/мл),
 *       как и в {@code EmisUnit.factor}; литр — наследие ранних данных;</li>
 *   <li>{@code PCS}/{@code PACK} → ×{@code piece_weight_g} (вес одной штуки/упаковки
 *       в граммах); если он не задан или ≤ 0 — конвертация НЕИЗВЕСТНА (null),
 *       т.к. «штука» без веса штуки в граммы не переводится.</li>
 * </ul>
 */
public enum UnitOfMeasure {
    KG,
    L,
    PCS,
    PACK;

    /** Граммов в одном килограмме (и — приближённо — в одном литре, см. javadoc enum). */
    public static final BigDecimal GRAMS_PER_KG = BigDecimal.valueOf(1000);

    /**
     * Граммов в одной единице измерения.
     *
     * @param pieceWeightG вес штуки/упаковки в граммах (для PCS/PACK); для KG/L игнорируется
     * @return коэффициент, либо {@code null}, если конвертация неизвестна
     *         (PCS/PACK без положительного pieceWeightG)
     */
    public BigDecimal gramsPerOne(BigDecimal pieceWeightG) {
        return switch (this) {
            case KG, L -> GRAMS_PER_KG;
            case PCS, PACK -> (pieceWeightG != null && pieceWeightG.signum() > 0)
                    ? pieceWeightG
                    : null;
        };
    }

    /**
     * Количество → граммы (без округления; scale результата = scale(amount) + scale(коэффициента)).
     *
     * @return граммы, либо {@code null}, если amount == null или конвертация неизвестна
     */
    public BigDecimal toGrams(BigDecimal amount, BigDecimal pieceWeightG) {
        if (amount == null) {
            return null;
        }
        BigDecimal per = gramsPerOne(pieceWeightG);
        return per == null ? null : amount.multiply(per);
    }
}
