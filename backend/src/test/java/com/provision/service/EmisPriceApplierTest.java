package com.provision.service;

import com.provision.entity.EmisPrice;
import com.provision.entity.EmisProduct;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.entity.UnitOfMeasure;
import com.provision.repository.EmisPriceRepository;
import com.provision.repository.EmisProductRepository;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.IngredientRepository;
import com.provision.service.EmisPriceApplier.LinkedProduct;
import com.provision.service.EmisPriceApplier.LocalPrice;
import com.provision.service.EmisPriceApplier.ProductOutcome;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit-тесты EmisPriceApplier (BL-2, KB-9-долг; аудит 29.10.2026, подзадача 27,
 * plans/2026-10-29-full-audit.md): перенос цен локальной копии ЕМИСС в
 * {@code ingredient_prices} — CREATED/UPDATED/SKIPPED, стирание ручных цен,
 * отброс несовместимых единиц, trip-копии не участвуют.
 *
 * <p>Репозитории — моки (слой сервиса, R2); фикстуры цен — реальные значения выгрузки
 * (8016 = 198,32 ₽/кг и др., см. BL-1/EmisUnitTest).</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("EmisPriceApplier: перенос цен ЕМИСС в ingredient_prices (BL-2)")
class EmisPriceApplierTest {

    private static final String SOURCE = "ROSSTAT";

    @Mock
    private IngredientRepository ingredientRepository;
    @Mock
    private EmisProductRepository emisProductRepository;
    @Mock
    private EmisPriceRepository emisPriceRepository;
    @Mock
    private IngredientPriceRepository priceRepository;

    private EmisPriceApplier applier() {
        return new EmisPriceApplier(ingredientRepository, emisProductRepository,
                emisPriceRepository, priceRepository);
    }

    /** Продукт в кг, привязанный к позиции ЕМИСС «…, кг» (MASS/1/KG) — пересчёт 1:1. */
    private LinkedProduct kgProduct(long id) {
        return new LinkedProduct(id, "Гречневая крупа", "KG", null,
                "8016", "Крупа гречневая, кг", new EmisUnit("MASS", BigDecimal.ONE, "KG", "кг"));
    }

    private Ingredient ingredient(long id) {
        return Ingredient.builder().id(id).name("Гречневая крупа")
                .unit(UnitOfMeasure.KG).build();
    }

    private IngredientPrice existingRow(String source, String price) {
        return IngredientPrice.builder()
                .pricePerUnit(new BigDecimal(price))
                .currency("RUB")
                .effectiveFrom(LocalDate.of(2026, 4, 1))
                .source(source)
                .build();
    }

    // ---------- apply: CREATED ----------

    @Test
    @DisplayName("новая точка — CREATED: цена пересчитана (198,32 ₽/кг), source=ROSSTAT; ручные цены стираются")
    void apply_createsPoint() {
        LinkedProduct product = kgProduct(1L);
        when(ingredientRepository.findById(1L)).thenReturn(Optional.of(ingredient(1L)));
        when(priceRepository.findByIngredientIdAndEffectiveFrom(1L, LocalDate.of(2026, 4, 1)))
                .thenReturn(Optional.empty());
        when(priceRepository.deleteManualByIngredientId(1L)).thenReturn(0);

        ProductOutcome outcome = applier().apply(product,
                List.of(new LocalPrice(LocalDate.of(2026, 4, 1), new BigDecimal("198.32"))), SOURCE);

        assertThat(outcome.created()).isEqualTo(1);
        assertThat(outcome.updated()).isZero();
        assertThat(outcome.action()).isEqualTo("CREATED");
        assertThat(outcome.newPrice()).isEqualByComparingTo("198.32");
        assertThat(outcome.oldPrice()).isNull();

        ArgumentCaptor<IngredientPrice> saved = ArgumentCaptor.forClass(IngredientPrice.class);
        verify(priceRepository).save(saved.capture());
        assertThat(saved.getValue().getPricePerUnit()).isEqualByComparingTo("198.32");
        assertThat(saved.getValue().getSource()).isEqualTo(SOURCE);
        assertThat(saved.getValue().getEffectiveFrom()).isEqualTo(LocalDate.of(2026, 4, 1));
        // хоть одна точка применена → остатки ручных цен удаляются
        verify(priceRepository).deleteManualByIngredientId(1L);
    }

    // ---------- apply: UPDATED + перезапись MANUAL ----------

    @Test
    @DisplayName("существующая точка — UPDATED: ручная цена перезаписана, счётчик стёртых в причине")
    void apply_updatesExistingManualRow() {
        LinkedProduct product = kgProduct(1L);
        IngredientPrice manual = existingRow("MANUAL", "150.00");
        when(ingredientRepository.findById(1L)).thenReturn(Optional.of(ingredient(1L)));
        when(priceRepository.findByIngredientIdAndEffectiveFrom(1L, LocalDate.of(2026, 4, 1)))
                .thenReturn(Optional.of(manual));
        when(priceRepository.deleteManualByIngredientId(1L)).thenReturn(0);

        ProductOutcome outcome = applier().apply(product,
                List.of(new LocalPrice(LocalDate.of(2026, 4, 1), new BigDecimal("198.32"))), SOURCE);

        assertThat(outcome.updated()).isEqualTo(1);
        assertThat(outcome.created()).isZero();
        assertThat(outcome.action()).isEqualTo("UPDATED");
        assertThat(outcome.oldPrice()).isEqualByComparingTo("150.00");
        assertThat(outcome.newPrice()).isEqualByComparingTo("198.32");
        assertThat(manual.getPricePerUnit()).isEqualByComparingTo("198.32");
        assertThat(manual.getSource()).isEqualTo(SOURCE);
        assertThat(outcome.reason()).contains("ручных цен стёрто: 1");
        verify(priceRepository).save(manual);
    }

    // ---------- apply: SKIPPED ----------

    @Test
    @DisplayName("несовместимые единицы (цена за кг → штучный продукт без piece_weight_g) — точка отброшена")
    void apply_skipsIncompatibleUnit() {
        // продукт в штуках без pieceWeightG → pricePerUnit(KG→PCS) = null
        LinkedProduct pcs = new LinkedProduct(2L, "Спички", "PCS", null,
                "5701", "Спички, коробок", new EmisUnit("MASS", BigDecimal.ONE, "KG", "кг"));
        when(ingredientRepository.findById(2L)).thenReturn(Optional.of(
                Ingredient.builder().id(2L).name("Спички").unit(UnitOfMeasure.PCS).build()));

        ProductOutcome outcome = applier().apply(pcs,
                List.of(new LocalPrice(LocalDate.of(2026, 4, 1), new BigDecimal("4.18"))), SOURCE);

        assertThat(outcome.skipped()).isEqualTo(1);
        assertThat(outcome.action()).isEqualTo("SKIPPED");
        assertThat(outcome.reason()).contains("отброшено");
        verify(priceRepository, never()).save(any());
        // ничего не применено → ручные цены НЕ удаляются (иначе продукт остался бы без цены)
        verify(priceRepository, never()).deleteManualByIngredientId(anyLong());
    }

    @Test
    @DisplayName("пустой список точек — SKIPPED с причиной «нет цен позиции»")
    void apply_emptyPoints_skipped() {
        ProductOutcome outcome = applier().apply(kgProduct(1L), List.of(), SOURCE);

        assertThat(outcome.action()).isEqualTo("SKIPPED");
        assertThat(outcome.reason()).contains("нет цен позиции");
        verify(priceRepository, never()).save(any());
        verify(priceRepository, never()).deleteManualByIngredientId(anyLong());
    }

    @Test
    @DisplayName("позиции нет в справочнике (emisName=null) — SKIPPED с причиной «не найдена»")
    void apply_unknownCatalogItem_skipped() {
        LinkedProduct orphan = new LinkedProduct(3L, "Нечто", "KG", null,
                "9999", null, EmisUnit.OTHER);

        ProductOutcome outcome = applier().apply(orphan, List.of(), SOURCE);

        assertThat(outcome.action()).isEqualTo("SKIPPED");
        assertThat(outcome.reason()).contains("не найдена в локальном справочнике");
    }

    @Test
    @DisplayName("продукт исчез до применения — SKIPPED «Продукт не найден»")
    void apply_productVanished_skipped() {
        when(ingredientRepository.findById(9L)).thenReturn(Optional.empty());

        ProductOutcome outcome = applier().apply(kgProduct(9L),
                List.of(new LocalPrice(LocalDate.of(2026, 4, 1), new BigDecimal("198.32"))), SOURCE);

        assertThat(outcome.action()).isEqualTo("SKIPPED");
        assertThat(outcome.reason()).contains("Продукт не найден");
        verify(priceRepository, never()).save(any());
    }

    // ---------- loadLinkedProducts / loadLocalPrices ----------

    @Test
    @DisplayName("loadLinkedProducts: только глобальные (trip_id IS NULL), отсутствующий код → EmisUnit.OTHER")
    void loadLinkedProducts_globalOnlyAndOtherForUnknown() {
        Ingredient linked = Ingredient.builder().id(1L).name("Гречневая крупа")
                .unit(UnitOfMeasure.KG).emisCode("8016").build();
        Ingredient orphan = Ingredient.builder().id(2L).name("Нечто")
                .unit(UnitOfMeasure.KG).emisCode("9999").build();
        // фильтр trip_id IS NULL зашит в самом методе репозитория — проверяем, что вызван именно он
        when(ingredientRepository.findByEmisCodeIsNotNullAndTripIdIsNull()).thenReturn(List.of(linked, orphan));
        EmisProduct catalogItem = mock(EmisProduct.class);
        lenient().when(catalogItem.getCode()).thenReturn("8016");
        lenient().when(catalogItem.getName()).thenReturn("Крупа гречневая, кг");
        lenient().when(catalogItem.getUnitKind()).thenReturn("MASS");
        lenient().when(catalogItem.getUnitAmount()).thenReturn(BigDecimal.ONE);
        lenient().when(catalogItem.getUnitScale()).thenReturn("KG");
        lenient().when(catalogItem.getUnitLabel()).thenReturn("кг");
        when(emisProductRepository.findByCodeIn(List.of("8016", "9999")))
                .thenReturn(List.of(catalogItem));

        List<LinkedProduct> out = applier().loadLinkedProducts();

        assertThat(out).hasSize(2);
        assertThat(out.get(0).emisUnit().kind()).isEqualTo("MASS");
        assertThat(out.get(0).emisName()).isEqualTo("Крупа гречневая, кг");
        // позиция не найдена в справочнике → OTHER, имя null
        assertThat(out.get(1).emisUnit()).isEqualTo(EmisUnit.OTHER);
        assertThat(out.get(1).emisName()).isNull();
        verify(ingredientRepository).findByEmisCodeIsNotNullAndTripIdIsNull();
    }

    @Test
    @DisplayName("loadLocalPrices: группировка по коду, сортировка по дате; пустой набор кодов → пустая карта")
    void loadLocalPrices_groupsAndSorts() {
        EmisPrice april = mock(EmisPrice.class);
        when(april.getEmisCode()).thenReturn("8016");
        when(april.getPrice()).thenReturn(new BigDecimal("198.32"));
        when(april.effectiveFrom()).thenReturn(LocalDate.of(2026, 4, 1));
        EmisPrice march = mock(EmisPrice.class);
        when(march.getEmisCode()).thenReturn("8016");
        when(march.getPrice()).thenReturn(new BigDecimal("195.10"));
        when(march.effectiveFrom()).thenReturn(LocalDate.of(2026, 3, 1));
        when(emisPriceRepository.findByRegionCodeAndEmisCodeIn(anyString(), any()))
                .thenReturn(List.of(april, march));

        Map<String, List<LocalPrice>> prices =
                applier().loadLocalPrices("643004.АГ", List.of("8016"));

        assertThat(prices).containsOnlyKeys("8016");
        assertThat(prices.get("8016")).extracting(LocalPrice::date)
                .containsExactly(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 4, 1));

        assertThat(applier().loadLocalPrices("643004.АГ", List.of())).isEmpty();
    }
}
