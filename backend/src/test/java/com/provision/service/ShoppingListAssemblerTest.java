package com.provision.service;

import com.provision.entity.Ingredient;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

// assembleByDays is not unit-tested here: requires a minimal Trip/Day aggregate that is not
// unit-testable in isolation (depends on DB-backed provisioning data). Skip documented per contract section 11.
class ShoppingListAssemblerTest {
    @Test
    void deltaPercent_zeroPlanned() {
        assertEquals(new BigDecimal("0.00"), ShoppingListAssembler.calculateDeltaPercent(BigDecimal.ZERO, new BigDecimal("5")));
    }

    @Test
    void deltaPercent_basic() {
        assertEquals(new BigDecimal("25.00"), ShoppingListAssembler.calculateDeltaPercent(new BigDecimal("100"), new BigDecimal("125")));
    }

    @Test
    void deltaPercent_nullPlanned_throwsNPE() {
        assertThrows(NullPointerException.class, () -> ShoppingListAssembler.calculateDeltaPercent(null, new BigDecimal("5")));
    }

    @Test
    void deltaPercent_nullActual_throwsNPE() {
        assertThrows(NullPointerException.class, () -> ShoppingListAssembler.calculateDeltaPercent(new BigDecimal("100"), null));
    }

    @Test
    void packs_nullOrNonPositivePackSize() {
        Ingredient ing = Ingredient.builder().packSize(null).roundToPacks(true).build();
        var r = ShoppingListAssembler.calculatePacks(ing, new BigDecimal("5"));
        assertNull(r.packsToBuy());
        assertNull(r.buyAmount());
        assertNull(r.leftoverAmount());
        assertNull(r.packSize());

        Ingredient ing2 = Ingredient.builder().packSize(new BigDecimal("0")).roundToPacks(true).build();
        var r2 = ShoppingListAssembler.calculatePacks(ing2, new BigDecimal("5"));
        assertEquals(new BigDecimal("0"), r2.packSize());
        assertNull(r2.packsToBuy());
    }

    @Test
    void packs_roundToPacksFalse_returnsNulls() {
        Ingredient ing = Ingredient.builder().packSize(new BigDecimal("2")).roundToPacks(false).build();
        var r = ShoppingListAssembler.calculatePacks(ing, new BigDecimal("5"));
        assertEquals(new BigDecimal("2"), r.packSize());
        assertNull(r.packsToBuy());
        assertNull(r.buyAmount());
        assertNull(r.leftoverAmount());
    }

    // Negative totalAmount boundary intentionally omitted: CEILING of a negative amount is
    // not a meaningful procurement case and is not part of the contract's boundary set.
    @Test
    void packs_valid() {
        Ingredient ing = Ingredient.builder().packSize(new BigDecimal("2")).roundToPacks(true).build();
        var r = ShoppingListAssembler.calculatePacks(ing, new BigDecimal("5"));
        assertEquals(3, r.packsToBuy());
        assertEquals(new BigDecimal("6.000"), r.buyAmount());
        assertEquals(new BigDecimal("1.000"), r.leftoverAmount());
    }

    @Test
    void packs_boundaries() {
        Ingredient ing = Ingredient.builder().packSize(new BigDecimal("2")).roundToPacks(true).build();
        // total < packSize
        var r1 = ShoppingListAssembler.calculatePacks(ing, new BigDecimal("1"));
        assertEquals(1, r1.packsToBuy());
        assertEquals(new BigDecimal("2.000"), r1.buyAmount());
        // exact multiple
        var r2 = ShoppingListAssembler.calculatePacks(ing, new BigDecimal("4"));
        assertEquals(2, r2.packsToBuy());
        assertEquals(new BigDecimal("0.000"), r2.leftoverAmount());
        // zero total
        var r3 = ShoppingListAssembler.calculatePacks(ing, BigDecimal.ZERO);
        assertEquals(0, r3.packsToBuy());
    }

    @Test
    void packs_nullIngredient_throwsNPE() {
        assertThrows(NullPointerException.class, () -> ShoppingListAssembler.calculatePacks(null, new BigDecimal("5")));
    }

    @Test
    void packs_nullTotalAmount_throwsNPE() {
        Ingredient ing = Ingredient.builder().packSize(new BigDecimal("2")).roundToPacks(true).build();
        assertThrows(NullPointerException.class, () -> ShoppingListAssembler.calculatePacks(ing, null));
    }

    @Test
    void assembleShoppingList_rounds() {
        var res = ShoppingListAssembler.assembleShoppingList(List.of(), new BigDecimal("10.6"), new BigDecimal("12.4"), new BigDecimal("1.00"), 0, false, List.of());
        assertEquals(new BigDecimal("11"), res.totalPlannedCost());
        assertEquals(new BigDecimal("12"), res.totalActualCost());
        assertEquals(new BigDecimal("1.00"), res.deltaPercent());
        assertNotNull(res.missingIngredients());
        assertTrue(res.missingIngredients().isEmpty());
    }

    @Test
    void assembleShoppingList_nullCosts() {
        var res = ShoppingListAssembler.assembleShoppingList(List.of(), null, null, null, 0, false, null);
        assertNull(res.totalPlannedCost());
        assertNull(res.totalActualCost());
        assertNull(res.deltaPercent());
        assertNull(res.missingIngredients());
    }

    @Test
    void assembleDay() {
        var res = ShoppingListAssembler.assembleDay(LocalDate.of(2026,1,1), List.of(), new BigDecimal("1.2"), new BigDecimal("2.7"), true);
        assertEquals("2026-01-01", res.dayDate());
        assertEquals(new BigDecimal("1"), res.plannedCost());
        assertEquals(new BigDecimal("3"), res.actualCost());
    }

    @Test
    void assembleDay_nullDayDate_throwsNPE() {
        assertThrows(NullPointerException.class, () -> ShoppingListAssembler.assembleDay(null, List.of(), new BigDecimal("1"), new BigDecimal("2"), false));
    }

    @Test
    void assembleDay_emptyItems() {
        var res = ShoppingListAssembler.assembleDay(LocalDate.of(2026,1,1), List.of(), new BigDecimal("0"), new BigDecimal("0"), false);
        assertTrue(res.items().isEmpty());
    }

    @Test
    void deltaPercent_negativePlanned() {
        assertEquals(new BigDecimal("-100.00"), ShoppingListAssembler.calculateDeltaPercent(new BigDecimal("-100"), BigDecimal.ZERO));
    }

    @Test
    void packs_negativePackSize_returnsNulls() {
        Ingredient ing = Ingredient.builder().packSize(new BigDecimal("-2")).roundToPacks(true).build();
        var r = ShoppingListAssembler.calculatePacks(ing, new BigDecimal("5"));
        assertEquals(new BigDecimal("-2"), r.packSize());
        assertNull(r.packsToBuy());
        assertNull(r.buyAmount());
        assertNull(r.leftoverAmount());
    }

    @Test
    void packs_boundaries_complete() {
        Ingredient ing = Ingredient.builder().packSize(new BigDecimal("2")).roundToPacks(true).build();
        var r1 = ShoppingListAssembler.calculatePacks(ing, new BigDecimal("1"));
        assertEquals(1, r1.packsToBuy());
        assertEquals(new BigDecimal("2.000"), r1.buyAmount());
        assertEquals(new BigDecimal("1.000"), r1.leftoverAmount());
        var r3 = ShoppingListAssembler.calculatePacks(ing, BigDecimal.ZERO);
        assertEquals(0, r3.packsToBuy());
        assertEquals(new BigDecimal("0.000"), r3.buyAmount());
        assertEquals(new BigDecimal("0.000"), r3.leftoverAmount());
    }

    @Test
    void packs_nullOrNonPositivePackSize_complete() {
        Ingredient ing = Ingredient.builder().packSize(new BigDecimal("0")).roundToPacks(true).build();
        var r2 = ShoppingListAssembler.calculatePacks(ing, new BigDecimal("5"));
        assertEquals(new BigDecimal("0"), r2.packSize());
        assertNull(r2.packsToBuy());
        assertNull(r2.buyAmount());
        assertNull(r2.leftoverAmount());
    }

    @Test
    void assembleOverall_orderingAndSubstitutedFrom() {
        Ingredient a = Ingredient.builder().id(1L).name("A").unit(com.provision.entity.UnitOfMeasure.PCS).build();
        Ingredient b = Ingredient.builder().id(2L).name("B").unit(com.provision.entity.UnitOfMeasure.PCS).build();
        ShoppingAggregation aa = new ShoppingAggregation(a);
        aa.addAmount(new BigDecimal("3"));
        aa.substitutedFromName = "X";
        ShoppingAggregation bb = new ShoppingAggregation(b);
        bb.addAmount(new BigDecimal("4"));
        bb.substitutedFromName = "Y";
        java.util.LinkedHashMap<Long, ShoppingAggregation> agg = new java.util.LinkedHashMap<>();
        agg.put(1L, aa);
        agg.put(2L, bb);
        java.util.Map<LocalDate, java.util.Map<Long, ShoppingAggregation>> perDay = new java.util.LinkedHashMap<>();
        java.util.Map<Long, ShoppingAggregation> day = new java.util.LinkedHashMap<>();
        ShoppingAggregation da = new ShoppingAggregation(a); da.addAmount(new BigDecimal("3")); da.substitutedFromName = "X";
        ShoppingAggregation db = new ShoppingAggregation(b); db.addAmount(new BigDecimal("4")); db.substitutedFromName = null;
        day.put(1L, da); day.put(2L, db);
        perDay.put(LocalDate.of(2026,1,1), day);
        var res = ShoppingListAssembler.assembleOverall(agg, perDay, java.util.Map.of(), java.util.Map.of(), java.util.Map.of());
        assertEquals(List.of(1L, 2L), res.items().stream().map(i -> i.ingredientId()).toList());
        assertEquals("X", res.items().get(0).substitutedFrom());
    }
}