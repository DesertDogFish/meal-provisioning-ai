package com.provision.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Fix-16: математика пересчёта цены фасовки в цену за единицу продукта
 * (вынесена из {@code IntegrationService} в {@link UnitPriceConverter} без изменения правил).
 *
 * <p>Эталонные округления — ARCHITECTURE (цены): 2 знака HALF_UP для ₽/единицу,
 * 6 знаков для промежуточного перевода фасовки. Несовместимые единицы → {@code null}
 * (точка цены отбрасывается синком и попадает в {@code reason} как «отброшено»).</p>
 */
@DisplayName("UnitPriceConverter: цена фасовки → цена за единицу продукта")
class UnitPriceConverterTest {

    @Test
    @DisplayName("900 г за 89.90 ₽ при продукте в KG → 99.89 ₽/KG (HALF_UP, 2 знака)")
    void gramsToKilograms() {
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("89.90"), new BigDecimal("900"), "g", "KG"))
                .isEqualByComparingTo("99.89");
    }

    @Test
    @DisplayName("0.350 KG за 249.90 ₽ → 714.00 ₽/KG")
    void sameUnitKilograms() {
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("249.90"), new BigDecimal("0.350"), "KG", "KG"))
                .isEqualByComparingTo("714.00");
    }

    @Test
    @DisplayName("1 KG за 89.90 ₽ → 89.90 ₽/KG (единицы совпадают)")
    void identicalUnits() {
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("89.90"), BigDecimal.ONE, "KG", "KG"))
                .isEqualByComparingTo("89.90");
    }

    @Test
    @DisplayName("Регистр единиц не важен: 'kg'/'Kg' == 'KG'")
    void unitCaseIsIgnored() {
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("100.00"), new BigDecimal("2"), "kg", "KG"))
                .isEqualByComparingTo("50.00");
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("100.00"), new BigDecimal("2"), "Kg", "kG"))
                .isEqualByComparingTo("50.00");
    }

    @ParameterizedTest(name = "объём/вес: {0} {1} → {2} = {3}")
    @CsvSource({
            "1500, ML, L,    1.5",
            "2,    L,  ML,   2000",
            "2500, G,  KG,   2.5",
            "3,    KG, G,    3000",
    })
    @DisplayName("Перевод количества между единицами веса и объёма")
    void convertsAmounts(String amount, String from, String to, String expected) {
        assertThat(UnitPriceConverter.convert(new BigDecimal(amount), from, to))
                .isEqualByComparingTo(expected);
    }

    @Test
    @DisplayName("Несовместимые единицы (KG → PCS, ML → KG) → null")
    void incompatibleUnitsGiveNull() {
        assertThat(UnitPriceConverter.convert(BigDecimal.ONE, "KG", "PCS")).isNull();
        assertThat(UnitPriceConverter.convert(BigDecimal.ONE, "ML", "KG")).isNull();
        assertThat(UnitPriceConverter.convert(BigDecimal.ONE, "PACK", "KG")).isNull();
    }

    @Test
    @DisplayName("null-единицы → null (провайдер без фасовки не роняет синк)")
    void nullUnitsGiveNull() {
        assertThat(UnitPriceConverter.convert(BigDecimal.ONE, null, "KG")).isNull();
        assertThat(UnitPriceConverter.convert(BigDecimal.ONE, "KG", null)).isNull();
        assertThat(UnitPriceConverter.convert(null, "KG", "KG")).isNull();
    }

    @Test
    @DisplayName("Цена за единицу: null/некорректная фасовка или единицы → null (точка отбрасывается)")
    void invalidInputsGiveNullPrice() {
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("10"), null, "KG", "KG")).isNull();
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("10"), BigDecimal.ZERO, "KG", "KG")).isNull();
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("10"), new BigDecimal("-1"), "KG", "KG")).isNull();
        assertThat(UnitPriceConverter.unitPrice(null, BigDecimal.ONE, "KG", "KG")).isNull();
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("10"), BigDecimal.ONE, "KG", "PCS")).isNull();
        assertThat(UnitPriceConverter.unitPrice(new BigDecimal("10"), BigDecimal.ONE, null, "KG")).isNull();
    }
}
