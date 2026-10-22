package com.provision.service;

import com.provision.dto.summary.ShoppingListResponse;
import com.provision.entity.*;
import com.provision.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@DisplayName("ADJ Tests: Price Overrides")
class PriceOverrideTest {

    @Mock
    private TripRepository tripRepository;
    @Mock
    private IngredientPriceRepository priceRepository;
    @Mock
    private RecipeRepository recipeRepository;
    @Mock
    private TripPriceOverrideRepository overrideRepository;
    @Mock
    private TripIngredientSubstitutionRepository substitutionRepository;

    private PriceResolutionService priceResolutionService;
    private SummaryService summaryService;

    private Trip trip;
    private Ingredient grechka;
    private Ingredient tushenka;
    private Ingredient sol;
    private Recipe recipe;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        
        priceResolutionService = new PriceResolutionService(priceRepository, overrideRepository);
        summaryService = new SummaryService(tripRepository, priceRepository, recipeRepository, priceResolutionService, substitutionRepository);

        // Создаём компоненты
        grechka = Ingredient.builder().id(1L).name("Гречка").unit(UnitOfMeasure.KG).build();
        tushenka = Ingredient.builder().id(2L).name("Тушёнка").unit(UnitOfMeasure.PCS).build();
        sol = Ingredient.builder().id(3L).name("Соль").unit(UnitOfMeasure.KG).build();

        // Создаём рецепт
        RecipeIngredient ri1 = RecipeIngredient.builder()
                .ingredient(grechka)
                .amount(new BigDecimal("0.8"))
                .build();
        RecipeIngredient ri2 = RecipeIngredient.builder()
                .ingredient(tushenka)
                .amount(new BigDecimal("4"))
                .build();
        RecipeIngredient ri3 = RecipeIngredient.builder()
                .ingredient(sol)
                .amount(new BigDecimal("0.02"))
                .build();

        recipe = Recipe.builder()
                .id(1L)
                .name("Гречка с тушёнкой")
                .baseServings(4)
                .ingredients(Arrays.asList(ri1, ri2, ri3))
                .build();

        // Создаём поход FIX-1: 12-14 мая, люди 4/3/2
        trip = Trip.builder()
                .id(1L)
                .startDate(LocalDate.of(2026, 5, 12))
                .endDate(LocalDate.of(2026, 5, 14))
                .defaultPeople(4)
                .build();

        TripDay day1 = TripDay.builder()
                .id(1L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 5, 12))
                .peopleOverride(null)
                .build();
        TripMeal meal1 = TripMeal.builder()
                .id(1L)
                .tripDay(day1)
                .recipe(recipe)
                .peopleOverride(null)
                .build();
        day1.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal1)));

        TripDay day2 = TripDay.builder()
                .id(2L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 5, 13))
                .peopleOverride(3)
                .build();
        TripMeal meal2 = TripMeal.builder()
                .id(2L)
                .tripDay(day2)
                .recipe(recipe)
                .peopleOverride(null)
                .build();
        day2.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal2)));

        TripDay day3 = TripDay.builder()
                .id(3L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 5, 14))
                .peopleOverride(null)
                .build();
        TripMeal meal3 = TripMeal.builder()
                .id(3L)
                .tripDay(day3)
                .recipe(recipe)
                .peopleOverride(2)
                .build();
        day3.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal3)));

        trip.setDays(new java.util.LinkedHashSet<>(Arrays.asList(day1, day2, day3)));
    }

    @Test
    @DisplayName("ADJ-01: Без оверрайдов actualCost == plannedCost")
    void testNoOverrides() {
        // Given: нет оверрайдов
        when(tripRepository.findByIdWithDaysAndMeals(1L, 1L)).thenReturn(java.util.Optional.of(trip));
        when(overrideRepository.findByTripId(1L)).thenReturn(Arrays.asList());
        
        // Плановые цены
        IngredientPrice grechkaPrice = IngredientPrice.builder()
                .ingredient(grechka)
                .pricePerUnit(new BigDecimal("200.00"))
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .build();
        IngredientPrice tushenkaPrice = IngredientPrice.builder()
                .ingredient(tushenka)
                .pricePerUnit(new BigDecimal("210.00"))
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .build();
        
        when(priceRepository.findEffectivePrice(eq(1L), any())).thenReturn(Optional.of(grechkaPrice));
        when(priceRepository.findEffectivePrice(eq(2L), any())).thenReturn(Optional.of(tushenkaPrice));
        when(priceRepository.findEffectivePrice(eq(3L), any())).thenReturn(Optional.empty());

        // When
        ShoppingListResponse response = summaryService.getShoppingList(1L, 1L);

        // Then
        assertThat(response.totalPlannedCost()).isEqualByComparingTo(response.totalActualCost());
        assertThat(response.overriddenCount()).isEqualTo(0);
        assertThat(response.deltaPercent()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("ADJ-02: Оверрайд гречки 250 вместо 200")
    void testOverrideGrechka() {
        // Given: оверрайд для гречки
        when(tripRepository.findByIdWithDaysAndMeals(1L, 1L)).thenReturn(java.util.Optional.of(trip));
        
        TripPriceOverride override = TripPriceOverride.builder()
                .trip(trip)
                .ingredient(grechka)
                .actualPrice(new BigDecimal("250.00"))
                .build();
        when(overrideRepository.findByTripId(1L)).thenReturn(Arrays.asList(override));
        
        // Плановые цены
        IngredientPrice grechkaPrice = IngredientPrice.builder()
                .ingredient(grechka)
                .pricePerUnit(new BigDecimal("200.00"))
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .build();
        IngredientPrice tushenkaPrice = IngredientPrice.builder()
                .ingredient(tushenka)
                .pricePerUnit(new BigDecimal("210.00"))
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .build();
        
        when(priceRepository.findEffectivePrice(eq(1L), any())).thenReturn(Optional.of(grechkaPrice));
        when(priceRepository.findEffectivePrice(eq(2L), any())).thenReturn(Optional.of(tushenkaPrice));
        when(priceRepository.findEffectivePrice(eq(3L), any())).thenReturn(Optional.empty());

        // When
        ShoppingListResponse response = summaryService.getShoppingList(1L, 1L);

        // Then
        // Гречка: 1.8 KG × 200 = 360 (план), 1.8 × 250 = 450 (факт)
        // Тушёнка: 9 PCS × 210 = 1890 (план и факт)
        // План: 360 + 1890 = 2250
        // Факт: 450 + 1890 = 2340
        assertThat(response.totalPlannedCost()).isEqualByComparingTo(new BigDecimal("2250.00"));
        assertThat(response.totalActualCost()).isEqualByComparingTo(new BigDecimal("2340.00"));
        assertThat(response.overriddenCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("ADJ-05: Итоги с несколькими оверрайдами")
    void testMultipleOverrides() {
        // Given: оверрайды для гречки (250), тушёнки (190), соли (30)
        when(tripRepository.findByIdWithDaysAndMeals(1L, 1L)).thenReturn(java.util.Optional.of(trip));
        
        TripPriceOverride override1 = TripPriceOverride.builder()
                .trip(trip)
                .ingredient(grechka)
                .actualPrice(new BigDecimal("250.00"))
                .build();
        TripPriceOverride override2 = TripPriceOverride.builder()
                .trip(trip)
                .ingredient(tushenka)
                .actualPrice(new BigDecimal("190.00"))
                .build();
        TripPriceOverride override3 = TripPriceOverride.builder()
                .trip(trip)
                .ingredient(sol)
                .actualPrice(new BigDecimal("30.00"))
                .build();
        
        when(overrideRepository.findByTripId(1L))
                .thenReturn(Arrays.asList(override1, override2, override3));
        
        // Плановые цены
        IngredientPrice grechkaPrice = IngredientPrice.builder()
                .ingredient(grechka)
                .pricePerUnit(new BigDecimal("200.00"))
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .build();
        IngredientPrice tushenkaPrice = IngredientPrice.builder()
                .ingredient(tushenka)
                .pricePerUnit(new BigDecimal("210.00"))
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .build();
        
        when(priceRepository.findEffectivePrice(eq(1L), any())).thenReturn(Optional.of(grechkaPrice));
        when(priceRepository.findEffectivePrice(eq(2L), any())).thenReturn(Optional.of(tushenkaPrice));
        when(priceRepository.findEffectivePrice(eq(3L), any())).thenReturn(Optional.empty());

        // When
        ShoppingListResponse response = summaryService.getShoppingList(1L, 1L);

        // Then
        // Гречка: план 360, факт 450
        // Тушёнка: план 1890, факт 1710
        // Соль: план missing, факт 1.35 (0.045 × 30)
        // План: 360 + 1890 = 2250
        // Факт: 450 + 1710 + 1.35 = 2161.35
        assertThat(response.totalPlannedCost()).isEqualByComparingTo(new BigDecimal("2250.00"));
        assertThat(response.totalActualCost()).isEqualByComparingTo(new BigDecimal("2161.35"));
        assertThat(response.overriddenCount()).isEqualTo(3);
        
        // Дельта: (2161.35 - 2250) / 2250 × 100 = -3.94%
        assertThat(response.deltaPercent()).isEqualByComparingTo(new BigDecimal("-3.94"));
    }
}
