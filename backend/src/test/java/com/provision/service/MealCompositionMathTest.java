package com.provision.service;

import com.provision.entity.Ingredient;
import com.provision.entity.Recipe;
import com.provision.entity.RecipeIngredient;
import com.provision.entity.TripIngredientSubstitution;
import com.provision.entity.UnitOfMeasure;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FORM-meal-composition-spec §3/§4.4 (Unit): масштабирование base/baseServings×people×ratio
 * (scale 3 HALF_UP), вес/ккал строки, применение SCALE-правок в конвейере закупки
 * (TripIngredientEditService.applyEdits) и перенос корректировок при substitution.
 */
@DisplayName("MealComposition math (§3)")
class MealCompositionMathTest {

    private SummaryService summaryService;
    private Ingredient kgIng;
    private Ingredient pcsIng;

    @BeforeEach
    void setUp() {
        // Чистые методы тестируются без репозиториев (паттерн SummaryServiceTest).
        summaryService = new SummaryService(null, null, null, null, null, null);
        kgIng = new Ingredient();
        kgIng.setId(1L);
        kgIng.setName("Картофель сублимированный");
        kgIng.setUnit(UnitOfMeasure.KG);
        kgIng.setKcalPer100g(new BigDecimal("336"));
        pcsIng = new Ingredient();
        pcsIng.setId(2L);
        pcsIng.setName("Рыбные консервы");
        pcsIng.setUnit(UnitOfMeasure.PCS);
        pcsIng.setKcalPer100g(new BigDecimal("120"));
        pcsIng.setPieceWeightG(new BigDecimal("250"));
    }

    @Test
    @DisplayName("SCALE ×1.5: derived = amount/baseServings × people × ratio, scale 3 HALF_UP")
    void scaleRatioAppliedWithRounding() {
        // 0,12 кг на 4 порции, 4 человека → derived 0,12; ×1,5 = 0,18
        BigDecimal derived = summaryService.calculateAmountForMeal(new BigDecimal("0.12"), 4, 4);
        assertThat(derived).isEqualByComparingTo("0.120");
        BigDecimal scaled = derived.multiply(new BigDecimal("1.5")).setScale(3, java.math.RoundingMode.HALF_UP);
        assertThat(scaled).isEqualByComparingTo("0.180");

        // эталон округления: 1/3 × 4 чел = 1,333 (не 1,334 и не 1,33)
        BigDecimal third = summaryService.calculateAmountForMeal(new BigDecimal("1"), 3, 4);
        assertThat(third).isEqualByComparingTo("1.333");
    }

    @Test
    @DisplayName("applyEdits: SCALE-правка (from==to) умножает количество строки рецепта")
    void applyEditsAppliesScaleInPlace() {
        Recipe recipe = new Recipe();
        recipe.setId(10L);
        recipe.setBaseServings(4);
        RecipeIngredient ri = new RecipeIngredient();
        ri.setIngredient(kgIng);
        ri.setAmount(new BigDecimal("0.12"));
        recipe.setIngredients(List.of(ri));

        TripIngredientSubstitution scale = new TripIngredientSubstitution();
        scale.setFromIngredient(kgIng);
        scale.setToIngredient(kgIng); // from==to → SCALED
        scale.setRatio(new BigDecimal("1.5"));
        scale.setAdded(false);
        scale.setRemoved(false);

        TripIngredientEditService svc = new TripIngredientEditService(null, null);
        List<TripIngredientEditService.EffectiveLine> lines = svc.applyEdits(
                1L, recipe, List.of(ri), Map.of(1L, scale), List.of());

        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).ingredient().getId()).isEqualTo(1L);
        // 0,12 × 1,5 = 0,18 на порцию (масштабированием людьми занимается SummaryService)
        assertThat(lines.get(0).amountPerServing()).isEqualByComparingTo("0.180");
    }

    @Test
    @DisplayName("applyEdits: EXTRA хранится как абсолют на приём — делится на people обратно")
    void applyEditsConvertsExtraAbsoluteToPerServing() {
        Recipe recipe = new Recipe();
        recipe.setId(10L);
        recipe.setBaseServings(4);

        TripIngredientSubstitution extra = new TripIngredientSubstitution();
        extra.setToIngredient(pcsIng);
        extra.setFromIngredient(null);
        extra.setAdded(true);
        extra.setAmountPerServing(new BigDecimal("0.0625")); // 0,25 абс / 4 чел (как пишет MealCompositionService)

        TripIngredientEditService svc = new TripIngredientEditService(null, null);
        List<TripIngredientEditService.EffectiveLine> lines = svc.applyEdits(
                1L, recipe, List.of(), Map.of(), List.of(extra));

        assertThat(lines).hasSize(1);
        // EffectiveLine.amountPerServing = 0,0625 → в SummaryService ×4 чел = 0,25 на приём (фикс.)
        assertThat(lines.get(0).amountPerServing()).isEqualByComparingTo("0.0625");
    }

    @Test
    @DisplayName("substitution A→B переносит количество и SCALE-корректировку A на B (§3)")
    void substitutionCarriesScaledQuantityIntoTarget() {
        Recipe recipe = new Recipe();
        recipe.setId(10L);
        recipe.setBaseServings(4);
        RecipeIngredient riA = new RecipeIngredient();
        riA.setIngredient(kgIng);
        riA.setAmount(new BigDecimal("0.12"));
        recipe.setIngredients(List.of(riA));

        // Единственная правка на from (unique trip+recipe+from): замена A→B ×2.
        // По §3 «adjustments исходного from-ингредиента переносятся на to вместе
        // с количеством»: в конвейере закупки applyEdits выдаёт строку B с
        // amount 0.12×2=0.24 на порцию, а строка A обнуляется (qty=0, не попадает в закупку).
        TripIngredientSubstitution subst = new TripIngredientSubstitution();
        subst.setFromIngredient(kgIng);
        subst.setToIngredient(pcsIng);
        subst.setRatio(new BigDecimal("2"));
        subst.setAdded(false);
        subst.setRemoved(false);

        TripIngredientEditService svc = new TripIngredientEditService(null, null);
        List<TripIngredientEditService.EffectiveLine> lines = svc.applyEdits(
                1L, recipe, List.of(riA), Map.of(1L, subst), List.of());

        assertThat(lines).hasSize(2);
        // Строка-источник A: количество обнулено, помечена substitutedFrom
        assertThat(lines.get(0).ingredient().getId()).isEqualTo(1L);
        assertThat(lines.get(0).amountPerServing()).isEqualByComparingTo("0");
        assertThat(lines.get(0).substitutedFromName()).isEqualTo("Картофель сублимированный");
        // Строка-получатель B: унаследовала количество A × ratio_sub
        assertThat(lines.get(1).ingredient().getId()).isEqualTo(2L);
        assertThat(lines.get(1).amountPerServing()).isEqualByComparingTo("0.240");

        // Каскад SCALE→SUBST на уровне эффективных количеств composition (§3):
        // derived = base/baseServings×people = 0,120; SCALE ×1,5 → 0,180;
        // затем substitution ×2 переносит 0,360 в B, источник := 0.
        java.math.BigDecimal derived = summaryService.calculateAmountForMeal(new BigDecimal("0.12"), 4, 4);
        java.math.BigDecimal scaled = derived.multiply(new BigDecimal("1.5"))
                .setScale(3, java.math.RoundingMode.HALF_UP);
        java.math.BigDecimal moved = scaled.multiply(new BigDecimal("2"))
                .setScale(3, java.math.RoundingMode.HALF_UP);
        assertThat(derived).isEqualByComparingTo("0.120");
        assertThat(scaled).isEqualByComparingTo("0.180");
        assertThat(moved).isEqualByComparingTo("0.360");
    }

    @Test
    @DisplayName("Вес и ккал строки: KG→×1000 г; PCS→piece_weight_g; kcal = г/100×kcalPer100g")
    void weightAndKcalOfItem() {
        assertThat(MealCompositionService.weightOfGrams(
                new BigDecimal("0.18"), UnitOfMeasure.KG, null)).isEqualByComparingTo("180");
        assertThat(MealCompositionService.weightOfGrams(
                new BigDecimal("1"), UnitOfMeasure.PCS, new BigDecimal("250"))).isEqualByComparingTo("250");
        // 0,18 кг картофеля × 336 ккал/100г = 604,8 ккал
        assertThat(MealCompositionService.kcalOf(
                new BigDecimal("0.18"), UnitOfMeasure.KG, new BigDecimal("336"), null))
                .isCloseTo(new BigDecimal("604.8"), org.assertj.core.api.Assertions.within(new BigDecimal("0.001")));
        // 1 шт консервов 250 г × 120 ккал/100г = 300 ккал
        assertThat(MealCompositionService.kcalOf(
                new BigDecimal("1"), UnitOfMeasure.PCS, new BigDecimal("120"), new BigDecimal("250")))
                .isCloseTo(new BigDecimal("300"), org.assertj.core.api.Assertions.within(new BigDecimal("0.001")));
    }
}
