package com.provision.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Единицы позиции ЕМИСС, пересчёт цены на единицу продукта и предупреждение о сомнительной
 * привязке (KB-5, KB-8; решения владельца 29.10.2026).
 *
 * <p>Фикстуры — НЕ выдуманные: названия позиций взяты из локальной копии справочника
 * (миграция V27 + правки V29), цены — из реальной выгрузки региона 643004.АГ за апрель 2026,
 * пары «продукт ↔ позиция» — из разбора каталога 29.10.2026 (харнес владельца):</p>
 * <ul>
 *   <li>8016 «Антисептик для рук, 100 мл» = 198.32 ₽;</li>
 *   <li>5311 «Крем для лица, 100 г (100 мл)» = 702.38 ₽;</li>
 *   <li>6502 «Бумага туалетная, рулон» = 26.49 ₽;</li>
 *   <li>6505 «Салфетки влажные, упаковка 20 шт.» = 42.90 ₽;</li>
 *   <li>5701 «Спички, коробок» = 4.18 ₽;</li>
 *   <li>1902 «Кофе натуральный растворимый, кг» = 4171.47 ₽;</li>
 *   <li>1501 «Яйца куриные, 10 шт.» = 113.85 ₽;</li>
 *   <li>9453 «Газ сжиженный в баллонах, 50 л» — цен в копии нет;</li>
 *   <li>9454 «Газ сжиженный, месяц с человека» = 391.48 ₽ (услуга).</li>
 * </ul>
 *
 * <p>Главный инвариант KB-5: предупреждение НИКОГДА не блокирует привязку — метод возвращает
 * текст или null, решение остаётся за админом.</p>
 */
@DisplayName("EmisUnit: единицы ЕМИСС, пересчёт цены и предупреждение о сомнительной привязке")
class EmisUnitTest {

    private static BigDecimal d(String value) {
        return new BigDecimal(value);
    }

    private static EmisUnit unit(String emisName) {
        return EmisUnit.of(emisName);
    }

    @Nested
    @DisplayName("Разбор суффикса названия позиции")
    class Parsing {

        @Test
        @DisplayName("Реальные названия каталога: масса, объём, штуки, услуга")
        void parsesRealCatalogNames() {
            assertThat(unit("Кофе натуральный растворимый, кг").kind()).isEqualTo("MASS");
            assertThat(unit("Кофе натуральный растворимый, кг").scale()).isEqualTo("KG");
            assertThat(unit("Кофе натуральный растворимый, кг").amount()).isEqualByComparingTo("1");

            assertThat(unit("Крем для лица, 100 г (100 мл)").kind()).isEqualTo("MASS");
            assertThat(unit("Крем для лица, 100 г (100 мл)").scale()).isEqualTo("G");
            assertThat(unit("Крем для лица, 100 г (100 мл)").amount()).isEqualByComparingTo("100");

            assertThat(unit("Антисептик для рук, 100 мл").kind()).isEqualTo("VOLUME");
            assertThat(unit("Антисептик для рук, 100 мл").scale()).isEqualTo("ML");
            assertThat(unit("Газ сжиженный в баллонах, 50 л").kind()).isEqualTo("VOLUME");
            assertThat(unit("Газ сжиженный в баллонах, 50 л").amount()).isEqualByComparingTo("50");
            assertThat(unit("Вода питьевая, л").scale()).isEqualTo("L");

            assertThat(unit("Яйца куриные, 10 шт.").kind()).isEqualTo("COUNT");
            assertThat(unit("Яйца куриные, 10 шт.").amount()).isEqualByComparingTo("10");
            // «упаковка 20 шт.» — единица наблюдения ЕМИСС сама является упаковкой,
            // поэтому amount = 1 упаковка, а не 20 штук (решение владельца по V29).
            assertThat(unit("Салфетки влажные, упаковка 20 шт.").kind()).isEqualTo("COUNT");
            assertThat(unit("Салфетки влажные, упаковка 20 шт.").amount()).isEqualByComparingTo("1");
            assertThat(unit("Бумага туалетная, рулон").kind()).isEqualTo("COUNT");
            assertThat(unit("Спички, коробок").kind()).isEqualTo("COUNT");
        }

        @Test
        @DisplayName("Услуга и нераспознанный суффикс — OTHER")
        void fallsBackToOther() {
            assertThat(unit("Газ сжиженный, месяц с человека").kind()).isEqualTo("OTHER");
            assertThat(unit("Доставка воды").kind()).isEqualTo("OTHER"); // нет суффикса после запятой
            assertThat(unit(null).kind()).isEqualTo("OTHER");
            assertThat(EmisUnit.OTHER.kind()).isEqualTo("OTHER");
        }

        @Test
        @DisplayName("label хранит исходный суффикс — его показывает UI")
        void keepsRawLabel() {
            assertThat(unit("Крем для лица, 100 г (100 мл)").label()).isEqualTo("100 г (100 мл)");
            assertThat(unit("Бумага туалетная, рулон").label()).isEqualTo("рулон");
        }
    }

    @Nested
    @DisplayName("pricePerUnit: пересчёт цены позиции на единицу продукта")
    class PricePerUnit {

        @Test
        @DisplayName("Плотность ≈ 1: цена за кг переносится в литры и наоборот")
        void densityIsOne() {
            EmisUnit coffee = unit("Кофе натуральный растворимый, кг");
            assertThat(coffee.rounded(coffee.pricePerUnit(d("4171.47"), "KG", null)))
                    .isEqualByComparingTo("4171.47");
            assertThat(coffee.rounded(coffee.pricePerUnit(d("4171.47"), "L", null)))
                    .isEqualByComparingTo("4171.47");

            EmisUnit water = unit("Вода питьевая, л");
            assertThat(water.rounded(water.pricePerUnit(d("44.07"), "L", null))).isEqualByComparingTo("44.07");
            assertThat(water.rounded(water.pricePerUnit(d("44.07"), "KG", null))).isEqualByComparingTo("44.07");
        }

        @Test
        @DisplayName("Штучный продукт: цена за объём приводится через piece_weight_g, прочитанный как мл")
        void pieceProductUsesPieceWeight() {
            EmisUnit antiseptic = unit("Антисептик для рук, 100 мл");
            // Наш антисептик — штука 100 г (= 100 мл при плотности 1) → цена ряда и есть цена штуки.
            assertThat(antiseptic.rounded(antiseptic.pricePerUnit(d("198.32"), "PCS", d("100"))))
                    .isEqualByComparingTo("198.32");

            EmisUnit coffee = unit("Кофе натуральный растворимый, кг");
            // Пакетик 20 г растворимого кофе: 4171.47 ₽/кг → 83.43 ₽ за пакетик.
            assertThat(coffee.rounded(coffee.pricePerUnit(d("4171.47"), "PCS", d("20"))))
                    .isEqualByComparingTo("83.43");

            EmisUnit cream = unit("Крем для лица, 100 г (100 мл)");
            assertThat(cream.rounded(cream.pricePerUnit(d("702.38"), "PCS", d("100"))))
                    .isEqualByComparingTo("702.38");
        }

        @Test
        @DisplayName("Штучные позиции ЕМИСС: цена за упаковку/коробок/рулон переносится на PCS и PACK")
        void countPositions() {
            EmisUnit napkins = unit("Салфетки влажные, упаковка 20 шт.");
            assertThat(napkins.rounded(napkins.pricePerUnit(d("42.90"), "PACK", null)))
                    .isEqualByComparingTo("42.90");

            EmisUnit paper = unit("Бумага туалетная, рулон");
            assertThat(paper.rounded(paper.pricePerUnit(d("26.49"), "PCS", d("75"))))
                    .isEqualByComparingTo("26.49");

            EmisUnit eggs = unit("Яйца куриные, 10 шт.");
            assertThat(eggs.rounded(eggs.pricePerUnit(d("113.85"), "PCS", null)))
                    .isEqualByComparingTo("11.39");
        }

        @Test
        @DisplayName("Неприводимые пары дают null — точка отбрасывается, а не искажает цену")
        void inconvertiblePairsGiveNull() {
            // Штуки классификатора против килограммов продукта: веса штуки в классификаторе нет.
            assertThat(unit("Яйца куриные, 10 шт.").pricePerUnit(d("113.85"), "KG", null)).isNull();
            // Услуга («месяц с человека») не переносится ни на что.
            assertThat(unit("Газ сжиженный, месяц с человека").pricePerUnit(d("391.48"), "KG", null)).isNull();
            assertThat(unit("Газ сжиженный, месяц с человека").pricePerUnit(d("391.48"), "PCS", d("220"))).isNull();
            // Штучному продукту не хватит piece_weight_g.
            assertThat(unit("Антисептик для рук, 100 мл").pricePerUnit(d("198.32"), "PCS", null)).isNull();
            assertThat(unit("Кофе натуральный растворимый, кг").pricePerUnit(d("4171.47"), "PACK", null)).isNull();
        }

        @Test
        @DisplayName("Без цены, с нулевой/отрицательной ценой или без единицы продукта — null")
        void guardsAgainstMissingInput() {
            EmisUnit coffee = unit("Кофе натуральный растворимый, кг");
            assertThat(coffee.pricePerUnit(null, "KG", null)).isNull();
            assertThat(coffee.pricePerUnit(BigDecimal.ZERO, "KG", null)).isNull();
            assertThat(coffee.pricePerUnit(d("-5"), "KG", null)).isNull();
            assertThat(coffee.pricePerUnit(d("4171.47"), null, null)).isNull();
            assertThat(coffee.pricePerUnit(d("4171.47"), "ШТУКА", null)).isNull();
            assertThat(coffee.rounded(null)).isNull();
        }
    }

    @Nested
    @DisplayName("convertsTo: приводится ли цена позиции к единице продукта В ПРИНЦИПЕ")
    class ConvertsTo {

        @Test
        @DisplayName("Матрица единиц: масса/объём ↔ кг/л всегда, штуки — только при piece_weight_g")
        void matrix() {
            EmisUnit mass = unit("Кофе натуральный растворимый, кг");
            assertThat(mass.convertsTo("KG", null)).isTrue();
            assertThat(mass.convertsTo("L", null)).isTrue();
            assertThat(mass.convertsTo("PCS", d("20"))).isTrue();
            assertThat(mass.convertsTo("PCS", null)).isFalse();
            assertThat(mass.convertsTo("PCS", BigDecimal.ZERO)).isFalse();

            EmisUnit volume = unit("Антисептик для рук, 100 мл");
            assertThat(volume.convertsTo("KG", null)).isTrue();
            assertThat(volume.convertsTo("PCS", d("100"))).isTrue();
            assertThat(volume.convertsTo("PCS", null)).isFalse();

            EmisUnit count = unit("Яйца куриные, 10 шт.");
            assertThat(count.convertsTo("PCS", null)).isTrue();
            assertThat(count.convertsTo("PACK", null)).isTrue();
            assertThat(count.convertsTo("KG", null)).isFalse();
            assertThat(count.convertsTo("L", d("1000"))).isFalse();

            EmisUnit other = unit("Газ сжиженный, месяц с человека");
            assertThat(other.convertsTo("KG", null)).isFalse();
            assertThat(other.convertsTo("PCS", d("220"))).isFalse();
            assertThat(other.convertsTo(null, null)).isFalse();
            assertThat(other.convertsTo("  ", null)).isFalse();
        }

        @Test
        @DisplayName("convertsTo не требует цены: у 9453 цен в копии нет, а неприводимость видна")
        void doesNotRequirePrice() {
            // KB-7/KB-5: предупреждение структурное, поэтому отсутствие цен его не глушит.
            EmisUnit gas = unit("Газ сжиженный в баллонах, 50 л");
            assertThat(gas.convertsTo("PCS", d("220"))).isTrue();
            assertThat(gas.pricePerUnit(null, "PCS", d("220"))).isNull();
            assertThat(unit("Яйца куриные, 10 шт.").convertsTo("KG", null)).isFalse();
        }
    }

    @Nested
    @DisplayName("linkWarning: три признака сомнительной пары (и молчание на принятых)")
    class LinkWarning {

        @Test
        @DisplayName("Признак 1: пересчёт невозможен — OTHER/услуга")
        void warnsWhenUnitIsNotConvertible() {
            String warning = unit("Газ сжиженный, месяц с человека")
                    .linkWarning(d("391.48"), "KG", null, d("100"));

            assertThat(warning).contains("Единица позиции не распознана")
                    .contains("месяц с человека")
                    .contains("синхронизация её пропустит");
        }

        @Test
        @DisplayName("Признак 1: позиция в штуках против продукта в кг (яйца ↔ яичный порошок)")
        void warnsOnCountAgainstMass() {
            String warning = unit("Яйца куриные, 10 шт.")
                    .linkWarning(d("113.85"), "KG", null, d("311.97"));

            assertThat(warning).contains("Позиция указана в штуках")
                    .contains("продукт — в кг")
                    .contains("Яйца куриные, 10 шт.");
        }

        @Test
        @DisplayName("Признак 1: штучному продукту не задан piece_weight_g")
        void warnsWhenPieceWeightIsMissing() {
            String warning = unit("Антисептик для рук, 100 мл")
                    .linkWarning(d("198.32"), "PCS", null, null);

            assertThat(warning).contains("нужен вес одной штуки (piece_weight_g)")
                    .contains("100 мл");
        }

        @Test
        @DisplayName("Признак 2: масштаб не сопоставим — «Газ сжиженный, 50 л» ≠ баллон 220 г (227×)")
        void warnsOnIncomparableMagnitude() {
            // Цен у позиции в копии нет — предупреждение всё равно звучит (проверка структурная).
            String warning = unit("Газ сжиженный в баллонах, 50 л")
                    .linkWarning(null, "PCS", d("220"), d("177.53"));

            assertThat(warning).contains("Масштаб не сопоставим")
                    .contains("50 л")
                    .contains("220 г")
                    .contains("227 раз")
                    .contains("плотность ≈ 1");
        }

        @Test
        @DisplayName("Признак 3: цена уехала в 10 раз и больше")
        void warnsWhenPriceDeviates() {
            EmisUnit coffee = unit("Кофе натуральный растворимый, кг");

            String warning = coffee.linkWarning(d("4171.47"), "PCS", d("20"), d("8.00"));

            assertThat(warning).contains("Цена после привязки — 83,43 ₽ за шт")
                    .contains("против текущей 8,00 ₽")
                    .contains("отличается в 10 раз");
        }

        @Test
        @DisplayName("Признак 3 (край): пересчёт округляется до 0,00 ₽ — фасовка слишком мелкая")
        void warnsWhenRoundedPriceIsZero() {
            // Синтетическая цена-крошка: проверяем именно ветку округления до нуля.
            String warning = unit("Крем для лица, 100 г (100 мл)")
                    .linkWarning(d("0.001"), "PCS", d("99"), null);

            assertThat(warning).contains("округляется до 0,00 ₽ за шт");
        }

        @Test
        @DisplayName("Молчит на принятых владельцем привязках «цена категории» (×0,18–4,7)")
        void staysSilentOnAcceptedCategoryPrices() {
            // Кофе: пакетик 20 г против кг — пересчёт 83.43 ₽ против текущей 17.75 ₽ (×4,7).
            assertThat(unit("Кофе натуральный растворимый, кг")
                    .linkWarning(d("4171.47"), "PCS", d("20"), d("17.75"))).isNull();
            // Антисептик 100 мл ↔ штука 100 г — один к одному.
            assertThat(unit("Антисептик для рук, 100 мл")
                    .linkWarning(d("198.32"), "PCS", d("100"), d("147.94"))).isNull();
            // Бумага: рулон ЕМИСС ↔ наш рулон 75 г.
            assertThat(unit("Бумага туалетная, рулон")
                    .linkWarning(d("26.49"), "PCS", d("75"), d("19.73"))).isNull();
            // Крем для лица 100 г ↔ наша штука 100 г.
            assertThat(unit("Крем для лица, 100 г (100 мл)")
                    .linkWarning(d("702.38"), "PCS", d("100"), d("443.82"))).isNull();
            // Вода: литр ↔ фляга 100 мл — масштаб ×10, под порогом 100.
            assertThat(unit("Вода питьевая, л")
                    .linkWarning(d("44.07"), "PCS", d("100"), d("4.4"))).isNull();
            // Спички: коробок ↔ коробок.
            assertThat(unit("Спички, коробок")
                    .linkWarning(d("4.18"), "PCS", null, d("5.00"))).isNull();
        }

        @Test
        @DisplayName("Молчит, если у позиции ещё нет цен (KB-7) и пара структурно правильная")
        void staysSilentWithoutPricesWhenPairIsStructurallyFine() {
            assertThat(unit("Молоко сухое цельное, кг")
                    .linkWarning(null, "KG", null, d("300"))).isNull();
            // Признаки 1 и 2 structural: без цены всё равно звучат.
            assertThat(unit("Газ сжиженный в баллонах, 50 л")
                    .linkWarning(null, "PCS", d("220"), null)).contains("Масштаб не сопоставим");
        }

        @Test
        @DisplayName("Без единицы продукта предупреждения нет: пересчитывать не на что")
        void staysSilentWithoutIngredientUnit() {
            assertThat(unit("Яйца куриные, 10 шт.").linkWarning(d("113.85"), null, null, null)).isNull();
            assertThat(unit("Яйца куриные, 10 шт.").linkWarning(d("113.85"), "  ", null, null)).isNull();
        }

        @Test
        @DisplayName("Несколько признаков соединяются в одно сообщение")
        void joinsSeveralNotes() {
            String warning = unit("Вода питьевая, л")
                    .linkWarning(d("0.50"), "PCS", d("5"), null);

            assertThat(warning).contains("Масштаб не сопоставим").contains("округляется до 0,00 ₽");
        }
    }
}
