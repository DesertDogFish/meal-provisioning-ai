package com.provision.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Подзадача 21 (план plans/done/2026-10-29-full-audit.md): конвертация единиц живёт
 * в enum UnitOfMeasure — граничные случаи gramsPerOne/toGrams.
 */
class UnitOfMeasureTest {

    @Test
    @DisplayName("KG/L: коэффициент — 1000, pieceWeightG игнорируется")
    void kgAndLUseThousand() {
        assertThat(UnitOfMeasure.KG.gramsPerOne(null)).isEqualByComparingTo("1000");
        assertThat(UnitOfMeasure.L.gramsPerOne(new BigDecimal("77"))).isEqualByComparingTo("1000");
        assertThat(UnitOfMeasure.KG.toGrams(new BigDecimal("2.5"), null))
                .isEqualByComparingTo("2500");
    }

    @Test
    @DisplayName("PCS/PACK: коэффициент — pieceWeightG; null/0/отрицательный → неизвестно (null)")
    void pcsAndPackRequirePositivePieceWeight() {
        assertThat(UnitOfMeasure.PCS.gramsPerOne(new BigDecimal("60"))).isEqualByComparingTo("60");
        assertThat(UnitOfMeasure.PACK.toGrams(new BigDecimal("3"), new BigDecimal("250")))
                .isEqualByComparingTo("750");
        assertThat(UnitOfMeasure.PCS.gramsPerOne(null)).isNull();
        assertThat(UnitOfMeasure.PCS.gramsPerOne(BigDecimal.ZERO)).isNull();
        assertThat(UnitOfMeasure.PCS.gramsPerOne(new BigDecimal("-5"))).isNull();
        assertThat(UnitOfMeasure.PACK.toGrams(BigDecimal.ONE, null)).isNull();
    }

    @Test
    @DisplayName("toGrams: null amount → null (без NPE)")
    void nullAmount() {
        assertThat(UnitOfMeasure.KG.toGrams(null, null)).isNull();
        assertThat(UnitOfMeasure.PCS.toGrams(null, BigDecimal.TEN)).isNull();
    }
}
