package com.provision.service;

import com.provision.entity.*;
import com.provision.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Детальные тесты бизнес-логики расчёта закупок и стоимости.
 * Показывают математику пошагово: из чего состоит поход, какая математика, что получаем.
 */
@DisplayName("Детальные тесты математики закупок")
class DetailedShoppingCalculationTest {

    private SummaryService summaryService;
    
    @Mock
    private TripRepository tripRepository;
    @Mock
    private IngredientPriceRepository priceRepository;
    @Mock
    private RecipeRepository recipeRepository;

    // Фикстура: поход с меняющимися ценами
    private Trip trip;
    private TripDay day1, day2, day3;
    private TripMeal meal1, meal2, meal3;
    private Recipe recipeGrechka;
    private Ingredient ingGrechka, ingTushenka, ingSalt;
    private List<IngredientPrice> grechkaPrices, tushenkaPrices, saltPrices;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        summaryService = new SummaryService(tripRepository, priceRepository, recipeRepository, null, null);

        // === КОМПОНЕНТЫ ===
        ingGrechka = Ingredient.builder().id(1L).name("Гречка").unit(UnitOfMeasure.KG).build();
        ingTushenka = Ingredient.builder().id(2L).name("Тушенка").unit(UnitOfMeasure.PCS).build();
        ingSalt = Ingredient.builder().id(3L).name("Соль").unit(UnitOfMeasure.KG).build();

        // === РЕЦЕПТ: Гречка с тушенкой (baseServings = 4) ===
        recipeGrechka = Recipe.builder()
                .id(1L)
                .name("Гречка с тушенкой")
                .baseServings(4)
                .build();

        // Состав рецепта:
        // - Гречка: 0.8 KG на 4 порции = 0.2 KG/порция
        // - Тушенка: 4 PCS на 4 порции = 1 PCS/порция
        // - Соль: 0.02 KG на 4 порции = 0.005 KG/порция
        RecipeIngredient ri1 = RecipeIngredient.builder()
                .ingredient(ingGrechka)
                .amount(new BigDecimal("0.8"))
                .build();
        RecipeIngredient ri2 = RecipeIngredient.builder()
                .ingredient(ingTushenka)
                .amount(new BigDecimal("4"))
                .build();
        RecipeIngredient ri3 = RecipeIngredient.builder()
                .ingredient(ingSalt)
                .amount(new BigDecimal("0.02"))
                .build();
        recipeGrechka.setIngredients(Arrays.asList(ri1, ri2, ri3));

        // === ПОХОД: 12-14 мая 2026, defaultPeople = 4 ===
        trip = Trip.builder()
                .id(1L)
                .name("Тестовый поход")
                .startDate(LocalDate.of(2026, 5, 12))
                .endDate(LocalDate.of(2026, 5, 14))
                .defaultPeople(4)
                .build();

        // День 1: 12 мая, 4 человека, ужин = Гречка с тушенкой
        day1 = TripDay.builder()
                .id(1L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 5, 12))
                .peopleOverride(null)
                .build();
        meal1 = TripMeal.builder()
                .id(1L)
                .tripDay(day1)
                .recipe(recipeGrechka)
                .peopleOverride(null)
                .build();
        day1.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal1)));

        // День 2: 13 мая, 3 человека (override), ужин = Гречка с тушенкой
        day2 = TripDay.builder()
                .id(2L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 5, 13))
                .peopleOverride(3)
                .build();
        meal2 = TripMeal.builder()
                .id(2L)
                .tripDay(day2)
                .recipe(recipeGrechka)
                .peopleOverride(null)
                .build();
        day2.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal2)));

        // День 3: 14 мая, 2 человека (meal override), ужин = Гречка с тушенкой
        day3 = TripDay.builder()
                .id(3L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 5, 14))
                .peopleOverride(null)
                .build();
        meal3 = TripMeal.builder()
                .id(3L)
                .tripDay(day3)
                .recipe(recipeGrechka)
                .peopleOverride(2)
                .build();
        day3.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal3)));

        trip.setDays(new java.util.LinkedHashSet<>(Arrays.asList(day1, day2, day3)));

        // === ЦЕНЫ (меняются во время похода) ===
        // Гречка: 180₽ до 1 мая, 200₽ с 1 мая
        grechkaPrices = Arrays.asList(
                IngredientPrice.builder()
                        .ingredient(ingGrechka)
                        .effectiveFrom(LocalDate.of(2026, 1, 1))
                        .pricePerUnit(new BigDecimal("180.00"))
                        .build(),
                IngredientPrice.builder()
                        .ingredient(ingGrechka)
                        .effectiveFrom(LocalDate.of(2026, 5, 1))
                        .pricePerUnit(new BigDecimal("200.00"))
                        .build()
        );

        // Тушенка: 210₽ стабильно
        tushenkaPrices = Arrays.asList(
                IngredientPrice.builder()
                        .ingredient(ingTushenka)
                        .effectiveFrom(LocalDate.of(2026, 1, 1))
                        .pricePerUnit(new BigDecimal("210.00"))
                        .build()
        );

        // Соль: нет цены
        saltPrices = Collections.emptyList();

        // Настройка моков
        when(tripRepository.findByIdWithDaysAndMeals(1L, 1L)).thenReturn(java.util.Optional.of(trip));
        
        // Гречка: цена на 12 мая = 200₽ (после 1 мая)
        when(priceRepository.findEffectivePrice(1L, LocalDate.of(2026, 5, 12)))
                .thenReturn(Optional.of(grechkaPrices.get(1))); // 200₽
        when(priceRepository.findEffectivePrice(1L, LocalDate.of(2026, 5, 13)))
                .thenReturn(Optional.of(grechkaPrices.get(1))); // 200₽
        when(priceRepository.findEffectivePrice(1L, LocalDate.of(2026, 5, 14)))
                .thenReturn(Optional.of(grechkaPrices.get(1))); // 200₽
        
        // Тушенка: всегда 210₽
        when(priceRepository.findEffectivePrice(2L, LocalDate.of(2026, 5, 12)))
                .thenReturn(Optional.of(tushenkaPrices.get(0)));
        when(priceRepository.findEffectivePrice(2L, LocalDate.of(2026, 5, 13)))
                .thenReturn(Optional.of(tushenkaPrices.get(0)));
        when(priceRepository.findEffectivePrice(2L, LocalDate.of(2026, 5, 14)))
                .thenReturn(Optional.of(tushenkaPrices.get(0)));
        
        // Соль: нет цены
        when(priceRepository.findEffectivePrice(3L, LocalDate.of(2026, 5, 12)))
                .thenReturn(Optional.empty());
        when(priceRepository.findEffectivePrice(3L, LocalDate.of(2026, 5, 13)))
                .thenReturn(Optional.empty());
        when(priceRepository.findEffectivePrice(3L, LocalDate.of(2026, 5, 14)))
                .thenReturn(Optional.empty());
    }

    @Test
    @DisplayName("ПРИМЕР: Пошаговый расчёт закупки с детальной математикой")
    void detailedShoppingCalculation() {
        System.out.println("\n========================================");
        System.out.println("ДЕТАЛЬНЫЙ РАСЧЁТ ЗАКУПКИ");
        System.out.println("========================================\n");

        System.out.println("ИСХОДНЫЕ ДАННЫЕ:");
        System.out.println("Поход: 12-14 мая 2026");
        System.out.println("defaultPeople = 4");
        System.out.println("Рецепт: Гречка с тушенкой (baseServings = 4)");
        System.out.println("  - Гречка: 0.8 KG / 4 порции = 0.2 KG/порция");
        System.out.println("  - Тушенка: 4 PCS / 4 порции = 1 PCS/порция");
        System.out.println("  - Соль: 0.02 KG / 4 порции = 0.005 KG/порция\n");

        // === ДЕНЬ 1: 12 мая, 4 человека ===
        System.out.println("ДЕНЬ 1: 12 мая 2026");
        System.out.println("  Люди: defaultPeople = 4 (override = null)");
        
        int people1 = summaryService.calculateEffectivePeople(trip, day1, meal1);
        System.out.println("  Фактически: " + people1 + " человек");
        
        BigDecimal grechka1 = summaryService.calculateAmountForMeal(
                new BigDecimal("0.8"), 4, people1);
        BigDecimal tushenka1 = summaryService.calculateAmountForMeal(
                new BigDecimal("4"), 4, people1);
        BigDecimal salt1 = summaryService.calculateAmountForMeal(
                new BigDecimal("0.02"), 4, people1);
        
        System.out.println("  Гречка: 0.8/4 * " + people1 + " = " + grechka1 + " KG");
        System.out.println("  Тушенка: 4/4 * " + people1 + " = " + tushenka1 + " PCS");
        System.out.println("  Соль: 0.02/4 * " + people1 + " = " + salt1 + " KG");
        
        // Цена на 12 мая
        BigDecimal priceGrechka1 = priceRepository.findEffectivePrice(1L, LocalDate.of(2026, 5, 12))
                .orElseThrow().getPricePerUnit();
        BigDecimal priceTushenka1 = priceRepository.findEffectivePrice(2L, LocalDate.of(2026, 5, 12))
                .orElseThrow().getPricePerUnit();
        
        BigDecimal costGrechka1 = grechka1.multiply(priceGrechka1).setScale(2, RoundingMode.HALF_UP);
        BigDecimal costTushenka1 = tushenka1.multiply(priceTushenka1).setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("  Стоимость:");
        System.out.println("    Гречка: " + grechka1 + " × " + priceGrechka1 + " = " + costGrechka1 + " ₽");
        System.out.println("    Тушенка: " + tushenka1 + " × " + priceTushenka1 + " = " + costTushenka1 + " ₽");
        System.out.println("    Соль: нет цены");
        System.out.println("  ИТОГО день 1: " + costGrechka1.add(costTushenka1) + " ₽\n");

        // === ДЕНЬ 2: 13 мая, 3 человека ===
        System.out.println("ДЕНЬ 2: 13 мая 2026");
        System.out.println("  Люди: dayOverride = 3");
        
        int people2 = summaryService.calculateEffectivePeople(trip, day2, meal2);
        System.out.println("  Фактически: " + people2 + " человека");
        
        BigDecimal grechka2 = summaryService.calculateAmountForMeal(
                new BigDecimal("0.8"), 4, people2);
        BigDecimal tushenka2 = summaryService.calculateAmountForMeal(
                new BigDecimal("4"), 4, people2);
        BigDecimal salt2 = summaryService.calculateAmountForMeal(
                new BigDecimal("0.02"), 4, people2);
        
        System.out.println("  Гречка: 0.8/4 * " + people2 + " = " + grechka2 + " KG");
        System.out.println("  Тушенка: 4/4 * " + people2 + " = " + tushenka2 + " PCS");
        System.out.println("  Соль: 0.02/4 * " + people2 + " = " + salt2 + " KG");
        
        BigDecimal priceGrechka2 = priceRepository.findEffectivePrice(1L, LocalDate.of(2026, 5, 13))
                .orElseThrow().getPricePerUnit();
        BigDecimal priceTushenka2 = priceRepository.findEffectivePrice(2L, LocalDate.of(2026, 5, 13))
                .orElseThrow().getPricePerUnit();
        
        BigDecimal costGrechka2 = grechka2.multiply(priceGrechka2).setScale(2, RoundingMode.HALF_UP);
        BigDecimal costTushenka2 = tushenka2.multiply(priceTushenka2).setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("  Стоимость:");
        System.out.println("    Гречка: " + grechka2 + " × " + priceGrechka2 + " = " + costGrechka2 + " ₽");
        System.out.println("    Тушенка: " + tushenka2 + " × " + priceTushenka2 + " = " + costTushenka2 + " ₽");
        System.out.println("  ИТОГО день 2: " + costGrechka2.add(costTushenka2) + " ₽\n");

        // === ДЕНЬ 3: 14 мая, 2 человека ===
        System.out.println("ДЕНЬ 3: 14 мая 2026");
        System.out.println("  Люди: mealOverride = 2");
        
        int people3 = summaryService.calculateEffectivePeople(trip, day3, meal3);
        System.out.println("  Фактически: " + people3 + " человека");
        
        BigDecimal grechka3 = summaryService.calculateAmountForMeal(
                new BigDecimal("0.8"), 4, people3);
        BigDecimal tushenka3 = summaryService.calculateAmountForMeal(
                new BigDecimal("4"), 4, people3);
        BigDecimal salt3 = summaryService.calculateAmountForMeal(
                new BigDecimal("0.02"), 4, people3);
        
        System.out.println("  Гречка: 0.8/4 * " + people3 + " = " + grechka3 + " KG");
        System.out.println("  Тушенка: 4/4 * " + people3 + " = " + tushenka3 + " PCS");
        System.out.println("  Соль: 0.02/4 * " + people3 + " = " + salt3 + " KG");
        
        BigDecimal priceGrechka3 = priceRepository.findEffectivePrice(1L, LocalDate.of(2026, 5, 14))
                .orElseThrow().getPricePerUnit();
        BigDecimal priceTushenka3 = priceRepository.findEffectivePrice(2L, LocalDate.of(2026, 5, 14))
                .orElseThrow().getPricePerUnit();
        
        BigDecimal costGrechka3 = grechka3.multiply(priceGrechka3).setScale(2, RoundingMode.HALF_UP);
        BigDecimal costTushenka3 = tushenka3.multiply(priceTushenka3).setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("  Стоимость:");
        System.out.println("    Гречка: " + grechka3 + " × " + priceGrechka3 + " = " + costGrechka3 + " ₽");
        System.out.println("    Тушенка: " + tushenka3 + " × " + priceTushenka3 + " = " + costTushenka3 + " ₽");
        System.out.println("  ИТОГО день 3: " + costGrechka3.add(costTushenka3) + " ₽\n");

        // === ИТОГИ ===
        System.out.println("========================================");
        System.out.println("ИТОГИ ПО ПОХОДУ:");
        System.out.println("========================================");
        
        BigDecimal totalGrechka = grechka1.add(grechka2).add(grechka3);
        BigDecimal totalTushenka = tushenka1.add(tushenka2).add(tushenka3);
        BigDecimal totalSalt = salt1.add(salt2).add(salt3);
        
        System.out.println("Количество:");
        System.out.println("  Гречка: " + grechka1 + " + " + grechka2 + " + " + grechka3 + " = " + totalGrechka + " KG");
        System.out.println("  Тушенка: " + tushenka1 + " + " + tushenka2 + " + " + tushenka3 + " = " + totalTushenka + " PCS");
        System.out.println("  Соль: " + salt1 + " + " + salt2 + " + " + salt3 + " = " + totalSalt + " KG");
        
        BigDecimal totalCost = costGrechka1.add(costGrechka2).add(costGrechka3)
                .add(costTushenka1).add(costTushenka2).add(costTushenka3);
        
        System.out.println("\nСтоимость:");
        System.out.println("  Гречка: " + costGrechka1 + " + " + costGrechka2 + " + " + costGrechka3 + " = " 
                + costGrechka1.add(costGrechka2).add(costGrechka3) + " ₽");
        System.out.println("  Тушенка: " + costTushenka1 + " + " + costTushenka2 + " + " + costTushenka3 + " = " 
                + costTushenka1.add(costTushenka2).add(costTushenka3) + " ₽");
        System.out.println("  Соль: нет цены");
        System.out.println("  ИТОГО: " + totalCost + " ₽");
        
        int totalPersonMeals = people1 + people2 + people3;
        System.out.println("\nВсего человеко-приёмов пищи: " + people1 + " + " + people2 + " + " + people3 + " = " + totalPersonMeals);
        System.out.println("Стоимость на человека (грубо): " + totalCost + " / " + trip.getDefaultPeople() + " = " 
                + totalCost.divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP) + " ₽");
        System.out.println("Стоимость на человеко-приём: " + totalCost + " / " + totalPersonMeals + " = " 
                + totalCost.divide(BigDecimal.valueOf(totalPersonMeals), 2, RoundingMode.HALF_UP) + " ₽");

        System.out.println("\n========================================\n");

        // === ASSERTIONS ===
        // Количества
        assertThat(totalGrechka).isEqualByComparingTo(new BigDecimal("1.800")); // 0.8 + 0.6 + 0.4
        assertThat(totalTushenka).isEqualByComparingTo(new BigDecimal("9.000")); // 4 + 3 + 2
        assertThat(totalSalt).isEqualByComparingTo(new BigDecimal("0.045")); // 0.02 + 0.015 + 0.01
        
        // Стоимость (если считаем по дням)
        // День 1: 0.8×200 + 4×210 = 160 + 840 = 1000
        // День 2: 0.6×200 + 3×210 = 120 + 630 = 750
        // День 3: 0.4×200 + 2×210 = 80 + 420 = 500
        // Итого: 2250
        assertThat(totalCost).isEqualByComparingTo(new BigDecimal("2250.00"));
        
        assertThat(totalPersonMeals).isEqualTo(9); // 4 + 3 + 2
    }

    @Test
    @DisplayName("Сценарий: цены меняются ВО ВРЕМЯ похода")
    void pricesChangeDuringTrip() {
        System.out.println("\n========================================");
        System.out.println("ЦЕНЫ МЕНЯЮТСЯ ВО ВРЕМЯ ПОХОДА");
        System.out.println("========================================\n");

        // Поход 10-20 мая
        // Гречка: 180₽ до 15 мая, 250₽ с 15 мая (скачок цены!)
        Ingredient ingGrechka2 = Ingredient.builder().id(10L).name("Гречка").unit(UnitOfMeasure.KG).build();
        
        List<IngredientPrice> grechkaPrices2 = Arrays.asList(
                IngredientPrice.builder()
                        .ingredient(ingGrechka2)
                        .effectiveFrom(LocalDate.of(2026, 1, 1))
                        .pricePerUnit(new BigDecimal("180.00"))
                        .build(),
                IngredientPrice.builder()
                        .ingredient(ingGrechka2)
                        .effectiveFrom(LocalDate.of(2026, 5, 15))
                        .pricePerUnit(new BigDecimal("250.00")) // Скачок с 180 до 250!
                        .build()
        );

        // Моки для нового ингредиента
        when(priceRepository.findEffectivePrice(10L, LocalDate.of(2026, 5, 10)))
                .thenReturn(Optional.of(grechkaPrices2.get(0))); // 180₽
        when(priceRepository.findEffectivePrice(10L, LocalDate.of(2026, 5, 20)))
                .thenReturn(Optional.of(grechkaPrices2.get(1))); // 250₽

        BigDecimal amount = new BigDecimal("0.8"); // 0.8 KG на 4 порции
        BigDecimal amountFor4People = summaryService.calculateAmountForMeal(amount, 4, 4); // 0.8 KG

        // День 10 мая: цена 180₽
        BigDecimal price10 = priceRepository.findEffectivePrice(10L, LocalDate.of(2026, 5, 10))
                .orElseThrow().getPricePerUnit();
        BigDecimal cost10 = amountFor4People.multiply(price10).setScale(2, RoundingMode.HALF_UP);

        // День 20 мая: цена 250₽
        BigDecimal price20 = priceRepository.findEffectivePrice(10L, LocalDate.of(2026, 5, 20))
                .orElseThrow().getPricePerUnit();
        BigDecimal cost20 = amountFor4People.multiply(price20).setScale(2, RoundingMode.HALF_UP);

        System.out.println("День 10 мая (до скачка цены):");
        System.out.println("  Количество: " + amountFor4People + " KG");
        System.out.println("  Цена: " + price10 + " ₽/KG");
        System.out.println("  Стоимость: " + cost10 + " ₽\n");

        System.out.println("День 20 мая (после скачка цены):");
        System.out.println("  Количество: " + amountFor4People + " KG");
        System.out.println("  Цена: " + price20 + " ₽/KG");
        System.out.println("  Стоимость: " + cost20 + " ₽\n");

        // Правильный расчёт: 144 + 200 = 344
        BigDecimal correctTotal = cost10.add(cost20);
        System.out.println("ПРАВИЛЬНЫЙ ИТОГ: " + cost10 + " + " + cost20 + " = " + correctTotal + " ₽\n");

        // Проверяем, что разница есть
        assertThat(correctTotal).isEqualByComparingTo(new BigDecimal("344.00")); // 144 + 200
        assertThat(cost10).isEqualByComparingTo(new BigDecimal("144.00")); // 0.8 × 180
        assertThat(cost20).isEqualByComparingTo(new BigDecimal("200.00")); // 0.8 × 250
    }
}
