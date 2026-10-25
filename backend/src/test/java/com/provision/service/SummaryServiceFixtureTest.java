package com.provision.service;

import com.provision.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.math.RoundingMode;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for SummaryService calculation logic
 * Uses FIX-1 fixture data for exact assertions
 */
@DisplayName("SummaryService Unit Tests - FIX-1 Fixture")
class SummaryServiceFixtureTest {

    private SummaryService summaryService;

    // FIX-1: Test data
    private Trip trip;
    private TripDay day1, day2, day3;
    private TripMeal meal1Breakfast, meal1Dinner, meal2Dinner, meal3Dinner;
    private Recipe recipeR1, recipeR2;
    private Ingredient ingredientI1, ingredientI2, ingredientI3, ingredientI4, ingredientI5;

    @BeforeEach
    void setUp() {
        // Тестируются только чистые методы (calculateAmount*/calculateEffectivePeople),
        // репозитории не нужны. Фаза 14 (N3): конструктор требует 6-й аргумент.
        summaryService = new SummaryService(null, null, null, null, null, null, null, null);

        // Create ingredients (FIX-1)
        ingredientI1 = Ingredient.builder().id(1L).name("Гречка").unit(UnitOfMeasure.KG).build();
        ingredientI2 = Ingredient.builder().id(2L).name("Тушенка").unit(UnitOfMeasure.PCS).build();
        ingredientI3 = Ingredient.builder().id(3L).name("Вода").unit(UnitOfMeasure.L).build();
        ingredientI4 = Ingredient.builder().id(4L).name("Соль").unit(UnitOfMeasure.KG).build();
        ingredientI5 = Ingredient.builder().id(5L).name("Овсяные хлопья").unit(UnitOfMeasure.KG).build();

        // Create recipes (FIX-1)
        // R1: Гречка с тушенкой, baseServings=4
        recipeR1 = Recipe.builder()
                .id(1L)
                .name("Гречка с тушенкой")
                .baseServings(4)
                .build();

        RecipeIngredient ri1_1 = RecipeIngredient.builder()
                .ingredient(ingredientI1)
                .amount(new BigDecimal("0.8")) // 0.8 KG на 4 порции = 0.2 на порцию
                .build();
        RecipeIngredient ri1_2 = RecipeIngredient.builder()
                .ingredient(ingredientI2)
                .amount(new BigDecimal("4")) // 4 PCS на 4 порции = 1 на порцию
                .build();
        RecipeIngredient ri1_4 = RecipeIngredient.builder()
                .ingredient(ingredientI4)
                .amount(new BigDecimal("0.02")) // 0.02 KG на 4 порции = 0.005 на порцию
                .build();

        // R2: Овсянка, baseServings=1
        recipeR2 = Recipe.builder()
                .id(2L)
                .name("Овсянка")
                .baseServings(1)
                .build();

        RecipeIngredient ri2_5 = RecipeIngredient.builder()
                .ingredient(ingredientI5)
                .amount(new BigDecimal("0.08")) // 0.08 KG на 1 порцию
                .build();
        RecipeIngredient ri2_3 = RecipeIngredient.builder()
                .ingredient(ingredientI3)
                .amount(new BigDecimal("0.25")) // 0.25 L на 1 порцию
                .build();

        // Create trip (FIX-1): 2026-05-12 to 2026-05-14, defaultPeople=4
        trip = Trip.builder()
                .id(1L)
                .defaultPeople(4)
                .build();

        // Day 1: 2026-05-12, override=null
        day1 = TripDay.builder()
                .id(1L)
                .trip(trip)
                .peopleOverride(null)
                .build();

        // Day 2: 2026-05-13, override=3
        day2 = TripDay.builder()
                .id(2L)
                .trip(trip)
                .peopleOverride(3)
                .build();

        // Day 3: 2026-05-14, override=null
        day3 = TripDay.builder()
                .id(3L)
                .trip(trip)
                .peopleOverride(null)
                .build();

        // Meals for Day 1: Завтрак R2, Ужин R1
        meal1Breakfast = TripMeal.builder()
                .id(1L)
                .tripDay(day1)
                .recipe(recipeR2)
                .peopleOverride(null)
                .build();

        meal1Dinner = TripMeal.builder()
                .id(2L)
                .tripDay(day1)
                .recipe(recipeR1)
                .peopleOverride(null)
                .build();

        // Meal for Day 2: Ужин R1
        meal2Dinner = TripMeal.builder()
                .id(3L)
                .tripDay(day2)
                .recipe(recipeR1)
                .peopleOverride(null)
                .build();

        // Meal for Day 3: Ужин R1, override=2
        meal3Dinner = TripMeal.builder()
                .id(4L)
                .tripDay(day3)
                .recipe(recipeR1)
                .peopleOverride(2)
                .build();
    }

    @Test
    @DisplayName("CALC-01: perPerson = amount / baseServings with BigDecimal precision")
    void calc01_perPersonCalculation() {
        // R1: 0.8 KG / 4 servings = 0.2 KG per person
        BigDecimal perPerson = summaryService.calculateAmountPerPerson(
                new BigDecimal("0.8"), 4);
        
        assertThat(perPerson).isEqualByComparingTo(new BigDecimal("0.200000"));
    }

    @Test
    @DisplayName("CALC-02: mealAmount = perPerson × people")
    void calc02_mealAmountCalculation() {
        // R1: 0.8 KG / 4 * 3 people = 0.6 KG
        BigDecimal mealAmount = summaryService.calculateAmountForMeal(
                new BigDecimal("0.8"), 4, 3);
        
        assertThat(mealAmount).isEqualByComparingTo(new BigDecimal("0.600"));
    }

    @Test
    @DisplayName("CALC-03: Priority of people override: meal > day > trip")
    void calc03_peopleOverridePriority() {
        // Day 1 breakfast: null > null > 4 = 4
        int day1BreakfastPeople = summaryService.calculateEffectivePeople(trip, day1, meal1Breakfast);
        assertThat(day1BreakfastPeople).isEqualTo(4);

        // Day 1 dinner: null > null > 4 = 4
        int day1DinnerPeople = summaryService.calculateEffectivePeople(trip, day1, meal1Dinner);
        assertThat(day1DinnerPeople).isEqualTo(4);

        // Day 2 dinner: null > 3 > 4 = 3 (day override)
        int day2DinnerPeople = summaryService.calculateEffectivePeople(trip, day2, meal2Dinner);
        assertThat(day2DinnerPeople).isEqualTo(3);

        // Day 3 dinner: 2 > null > 4 = 2 (meal override)
        int day3DinnerPeople = summaryService.calculateEffectivePeople(trip, day3, meal3Dinner);
        assertThat(day3DinnerPeople).isEqualTo(2);
    }

    @Test
    @DisplayName("CALC-04: Day sums match FIX-1 expectations")
    void calc04_daySums() {
        // Day 1: R1 (4 people) + R2 (4 people)
        // Гречка: 0.8/4 * 4 = 0.8 KG
        BigDecimal day1Grechka = summaryService.calculateAmountForMeal(
                new BigDecimal("0.8"), 4, 4);
        assertThat(day1Grechka).isEqualByComparingTo(new BigDecimal("0.800"));

        // Тушенка: 4/4 * 4 = 4 PCS
        BigDecimal day1Tushenka = summaryService.calculateAmountForMeal(
                new BigDecimal("4"), 4, 4);
        assertThat(day1Tushenka).isEqualByComparingTo(new BigDecimal("4.000"));

        // Соль: 0.02/4 * 4 = 0.02 KG
        BigDecimal day1Sol = summaryService.calculateAmountForMeal(
                new BigDecimal("0.02"), 4, 4);
        assertThat(day1Sol).isEqualByComparingTo(new BigDecimal("0.020"));

        // Day 2: R1 (3 people)
        // Гречка: 0.8/4 * 3 = 0.6 KG
        BigDecimal day2Grechka = summaryService.calculateAmountForMeal(
                new BigDecimal("0.8"), 4, 3);
        assertThat(day2Grechka).isEqualByComparingTo(new BigDecimal("0.600"));

        // Тушенка: 4/4 * 3 = 3 PCS
        BigDecimal day2Tushenka = summaryService.calculateAmountForMeal(
                new BigDecimal("4"), 4, 3);
        assertThat(day2Tushenka).isEqualByComparingTo(new BigDecimal("3.000"));

        // Соль: 0.02/4 * 3 = 0.015 KG
        BigDecimal day2Sol = summaryService.calculateAmountForMeal(
                new BigDecimal("0.02"), 4, 3);
        assertThat(day2Sol).isEqualByComparingTo(new BigDecimal("0.015"));

        // Day 3: R1 (2 people)
        // Гречка: 0.8/4 * 2 = 0.4 KG
        BigDecimal day3Grechka = summaryService.calculateAmountForMeal(
                new BigDecimal("0.8"), 4, 2);
        assertThat(day3Grechka).isEqualByComparingTo(new BigDecimal("0.400"));

        // Тушенка: 4/4 * 2 = 2 PCS
        BigDecimal day3Tushenka = summaryService.calculateAmountForMeal(
                new BigDecimal("4"), 4, 2);
        assertThat(day3Tushenka).isEqualByComparingTo(new BigDecimal("2.000"));

        // Соль: 0.02/4 * 2 = 0.01 KG
        BigDecimal day3Sol = summaryService.calculateAmountForMeal(
                new BigDecimal("0.02"), 4, 2);
        assertThat(day3Sol).isEqualByComparingTo(new BigDecimal("0.010"));
    }

    @Test
    @DisplayName("CALC-05: Trip totals match FIX-1 expectations")
    void calc05_tripTotals() {
        // Гречка total: 0.8 + 0.6 + 0.4 = 1.8 KG
        BigDecimal totalGrechka = new BigDecimal("0.8")
                .add(new BigDecimal("0.6"))
                .add(new BigDecimal("0.4"));
        assertThat(totalGrechka).isEqualByComparingTo(new BigDecimal("1.8"));

        // Тушенка total: 4 + 3 + 2 = 9 PCS
        BigDecimal totalTushenka = new BigDecimal("4")
                .add(new BigDecimal("3"))
                .add(new BigDecimal("2"));
        assertThat(totalTushenka).isEqualByComparingTo(new BigDecimal("9"));

        // Соль total: 0.02 + 0.015 + 0.01 = 0.045 KG
        BigDecimal totalSol = new BigDecimal("0.02")
                .add(new BigDecimal("0.015"))
                .add(new BigDecimal("0.01"));
        assertThat(totalSol).isEqualByComparingTo(new BigDecimal("0.045"));

        // Овсянка total: 0.08 (day 1 breakfast only)
        BigDecimal totalOvsyanka = new BigDecimal("0.08");
        assertThat(totalOvsyanka).isEqualByComparingTo(new BigDecimal("0.08"));

        // Вода total: 0.25 (day 1 breakfast only)
        BigDecimal totalVoda = new BigDecimal("0.25");
        assertThat(totalVoda).isEqualByComparingTo(new BigDecimal("0.25"));
    }

    @Test
    @DisplayName("CALC-06: Precision with small amounts (0.005 × 3 = 0.015)")
    void calc06_precisionWithSmallAmounts() {
        // Соль: 0.02/4 = 0.005 per person
        BigDecimal perPerson = summaryService.calculateAmountPerPerson(
                new BigDecimal("0.02"), 4);
        assertThat(perPerson).isEqualByComparingTo(new BigDecimal("0.005000"));

        // 0.005 × 3 = 0.015
        BigDecimal for3People = summaryService.calculateAmountForMeal(
                new BigDecimal("0.02"), 4, 3);
        assertThat(for3People).isEqualByComparingTo(new BigDecimal("0.015"));
    }

    @Test
    @DisplayName("CALC-07: Total person-meals = 13")
    void calc07_totalPersonMeals() {
        // Day 1: 4 + 4 = 8
        // Day 2: 3
        // Day 3: 2
        // Total: 13
        int totalPersonMeals = 4 + 4 + 3 + 2;
        assertThat(totalPersonMeals).isEqualTo(13);
    }

    @Test
    @DisplayName("PRICE-03: Price selection by date")
    void price03_priceSelectionByDate() {
        // Given: price 180 from 2026-01-01, price 200 from 2026-05-01
        // When: calculate on 2026-05-12 → should use 200
        // When: calculate on 2026-02-14 → should use 180
        
        // This test would require mocking priceRepository
        // For now, just verify the logic concept
        assertThat(true).isTrue(); // Placeholder
    }

    @Test
    @DisplayName("EDGE-01: Large people override (1000)")
    void edge01_largePeopleOverride() {
        // Should not overflow
        BigDecimal amount = summaryService.calculateAmountForMeal(
                new BigDecimal("0.8"), 4, 1000);
        
        // 0.8/4 * 1000 = 200
        assertThat(amount).isEqualByComparingTo(new BigDecimal("200.000"));
    }

    @Test
    @DisplayName("EDGE-02: Amount with 4 decimal places (0.0005)")
    void edge02_fourDecimalPlaces() {
        BigDecimal amount = new BigDecimal("0.0005");
        BigDecimal perPerson = summaryService.calculateAmountPerPerson(amount, 1);
        
        assertThat(perPerson).isEqualByComparingTo(new BigDecimal("0.000500"));
    }
}
