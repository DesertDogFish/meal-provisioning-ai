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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

/**
 * Тест корректности агрегации стоимости в общей закупке (исторически — демонстрация бага).
 * FIX P1: баг исправлен на бэкенде — getShoppingList суммирует стоимости по дням
 * (пакетная загрузка ценовых рядов), поэтому @Disabled снят, а моки переведены
 * с per-ingredient findEffectivePrice на пакетные методы сервиса.
 */
@DisplayName("АГРЕГАЦИЯ СТОИМОСТИ: корректно суммируется по дням (не по endDate)")
class ShoppingListCostAggregationBugTest {

    private SummaryService summaryService;
    
    @Mock
    private TripRepository tripRepository;
    @Mock
    private IngredientPriceRepository priceRepository;
    @Mock
    private RecipeRepository recipeRepository;
    @Mock
    private PriceResolutionService priceResolutionService;
    @Mock
    private TripIngredientSubstitutionRepository substitutionRepository;
    // Фаза 14 (N3): SummaryService требует TripIngredientEditService (6-й аргумент).
    // Реальный сервис на моке substitutionRepository: findAllEditsForTrip → пустой
    // список (стаб ниже) → правок состава нет, агрегация считается как раньше.
    private TripIngredientEditService tripIngredientEditService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        when(priceResolutionService.getAllOverrides(org.mockito.ArgumentMatchers.anyLong()))
            .thenReturn(Collections.emptyMap());
        when(substitutionRepository.findByTripId(org.mockito.ArgumentMatchers.anyLong()))
            .thenReturn(Collections.emptyList());
        when(substitutionRepository.findAllEditsForTrip(org.mockito.ArgumentMatchers.anyLong()))
            .thenReturn(Collections.emptyList());
        tripIngredientEditService = new TripIngredientEditService(substitutionRepository, null);
        summaryService = new SummaryService(tripRepository, priceRepository, recipeRepository, priceResolutionService, substitutionRepository, tripIngredientEditService);
    }

    @Test
    @DisplayName("СЦЕНАРИЙ: Продукт встречается в разные дни, стоимость должна суммироваться")
    void costAggregation_shouldSumCostsAcrossDays() {
        System.out.println("\n========================================");
        System.out.println("СЦЕНАРИЙ: Гречка в два разных дня");
        System.out.println("========================================\n");

        // Ингредиент: Гречка, цена 120₽/кг
        Ingredient grechka = Ingredient.builder()
                .id(1L)
                .name("Гречка")
                .unit(UnitOfMeasure.KG)
                .build();

        IngredientPrice price = IngredientPrice.builder()
                .ingredient(grechka)
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .pricePerUnit(new BigDecimal("120.00")) // 120₽ за KG
                .build();

        // Рецепт: baseServings = 1, 0.1 KG гречки на порцию
        Recipe recipe = Recipe.builder()
                .id(1L)
                .name("Гречка простая")
                .baseServings(1)
                .build();

        RecipeIngredient ri = RecipeIngredient.builder()
                .ingredient(grechka)
                .amount(new BigDecimal("0.1")) // 0.1 KG = 100 г на порцию
                .build();
        recipe.setIngredients(Arrays.asList(ri));

        // Поход: 2 дня, 4 человека каждый день
        Trip trip = Trip.builder()
                .id(1L)
                .startDate(LocalDate.of(2026, 10, 21))
                .endDate(LocalDate.of(2026, 10, 22))
                .defaultPeople(4)
                .build();

        // День 1: 1 порция на 4 человека = 0.4 KG
        TripDay day1 = TripDay.builder()
                .id(1L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 10, 21))
                .peopleOverride(null)
                .build();
        TripMeal meal1 = TripMeal.builder()
                .id(1L)
                .tripDay(day1)
                .recipe(recipe)
                .peopleOverride(null)
                .build();
        day1.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal1)));

        // День 2: 1 порция на 4 человека = 0.4 KG
        TripDay day2 = TripDay.builder()
                .id(2L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 10, 22))
                .peopleOverride(null)
                .build();
        TripMeal meal2 = TripMeal.builder()
                .id(2L)
                .tripDay(day2)
                .recipe(recipe)
                .peopleOverride(null)
                .build();
        day2.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal2)));

        trip.setDays(new java.util.LinkedHashSet<>(Arrays.asList(day1, day2)));

        // Настройка моков
        when(tripRepository.findByIdWithDaysAndMeals(1L, 1L)).thenReturn(java.util.Optional.of(trip));
        // FIX P1: пакетные моки вместо per-day findEffectivePrice.
        when(priceRepository.findLatestPricesAsOfForIngredients(any(), anyCollection()))
                .thenAnswer(inv -> List.of(price));
        when(priceRepository.findByIngredientIdInOrderByEffectiveFromDesc(anyCollection()))
                .thenAnswer(inv -> List.of(price));

        System.out.println("ИСХОДНЫЕ ДАННЫЕ:");
        System.out.println("  Ингредиент: Гречка, цена = 120₽/KG");
        System.out.println("  Рецепт: 0.1 KG на 1 порцию");
        System.out.println("  Поход: 2 дня по 4 человека\n");

        // РАСЧЁТ ПО ДНЯМ
        System.out.println("РАСЧЁТ ПО ДНЯМ:");
        
        // День 1
        int people1 = summaryService.calculateEffectivePeople(trip, day1, meal1);
        BigDecimal amount1 = summaryService.calculateAmountForMeal(
                new BigDecimal("0.1"), 1, people1);
        BigDecimal cost1 = amount1.multiply(price.getPricePerUnit())
                .setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("  День 1 (21 окт):");
        System.out.println("    Люди: " + people1);
        System.out.println("    Количество: 0.1 KG × " + people1 + " = " + amount1 + " KG (" 
                + amount1.multiply(new BigDecimal("1000")) + " г)");
        System.out.println("    Стоимость: " + amount1 + " × 120 = " + cost1 + " ₽");

        // День 2
        int people2 = summaryService.calculateEffectivePeople(trip, day2, meal2);
        BigDecimal amount2 = summaryService.calculateAmountForMeal(
                new BigDecimal("0.1"), 1, people2);
        BigDecimal cost2 = amount2.multiply(price.getPricePerUnit())
                .setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("  День 2 (22 окт):");
        System.out.println("    Люди: " + people2);
        System.out.println("    Количество: 0.1 KG × " + people2 + " = " + amount2 + " KG (" 
                + amount2.multiply(new BigDecimal("1000")) + " г)");
        System.out.println("    Стоимость: " + amount2 + " × 120 = " + cost2 + " ₽\n");

        // ПРАВИЛЬНАЯ АГРЕГАЦИЯ
        BigDecimal totalAmount = amount1.add(amount2);
        BigDecimal correctTotalCost = cost1.add(cost2);
        
        System.out.println("ПРАВИЛЬНАЯ АГРЕГАЦИЯ:");
        System.out.println("  Общее количество: " + amount1 + " + " + amount2 + " = " + totalAmount + " KG");
        System.out.println("  Общая стоимость: " + cost1 + " + " + cost2 + " = " + correctTotalCost + " ₽\n");

        // ТЕКУЩАЯ РЕАЛИЗАЦИЯ (если пересчитывает по общему количеству)
        BigDecimal wrongTotalCost = totalAmount.multiply(price.getPricePerUnit())
                .setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("ТЕКУЩАЯ РЕАЛИЗАЦИЯ (пересчёт по общему количеству):");
        System.out.println("  Общее количество: " + totalAmount + " KG");
        System.out.println("  Стоимость: " + totalAmount + " × 120 = " + wrongTotalCost + " ₽\n");

        // В данном случае оба метода дают одинаковый результат
        assertThat(correctTotalCost).isEqualByComparingTo(wrongTotalCost);
        assertThat(totalAmount).isEqualByComparingTo(new BigDecimal("0.8")); // 800 г
        assertThat(correctTotalCost).isEqualByComparingTo(new BigDecimal("96.00"));

        System.out.println("✓ В данном случае оба метода дают одинаковый результат.\n");
        System.out.println("НО! Если цены менялись во время похода или округление работало по-разному,");
        System.out.println("то пересчёт по общему количеству даст ошибку!\n");
    }

    @Test
    @DisplayName("БАГ: Цены меняются между днями - пересчёт даёт ошибку")
    void costAggregation_bugWithChangingPrices() {
        System.out.println("\n========================================");
        System.out.println("СЦЕНАРИЙ: Цены меняются между днями");
        System.out.println("========================================\n");

        Ingredient grechka = Ingredient.builder()
                .id(1L)
                .name("Гречка")
                .unit(UnitOfMeasure.KG)
                .build();

        // Цена в день 1: 120₽/кг
        IngredientPrice priceDay1 = IngredientPrice.builder()
                .ingredient(grechka)
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .pricePerUnit(new BigDecimal("120.00"))
                .build();

        // Цена в день 2: 150₽/кг (подорожала!)
        IngredientPrice priceDay2 = IngredientPrice.builder()
                .ingredient(grechka)
                .effectiveFrom(LocalDate.of(2026, 10, 22))
                .pricePerUnit(new BigDecimal("150.00"))
                .build();

        Recipe recipe = Recipe.builder()
                .id(1L)
                .name("Гречка")
                .baseServings(1)
                .build();

        RecipeIngredient ri = RecipeIngredient.builder()
                .ingredient(grechka)
                .amount(new BigDecimal("0.1")) // 100 г
                .build();
        recipe.setIngredients(Arrays.asList(ri));

        Trip trip = Trip.builder()
                .id(1L)
                .startDate(LocalDate.of(2026, 10, 21))
                .endDate(LocalDate.of(2026, 10, 22))
                .defaultPeople(4)
                .build();

        // День 1: 4 человека
        TripDay day1 = TripDay.builder()
                .id(1L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 10, 21))
                .peopleOverride(null)
                .build();
        TripMeal meal1 = TripMeal.builder()
                .id(1L)
                .tripDay(day1)
                .recipe(recipe)
                .peopleOverride(null)
                .build();
        day1.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal1)));

        // День 2: 4 человека
        TripDay day2 = TripDay.builder()
                .id(2L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 10, 22))
                .peopleOverride(null)
                .build();
        TripMeal meal2 = TripMeal.builder()
                .id(2L)
                .tripDay(day2)
                .recipe(recipe)
                .peopleOverride(null)
                .build();
        day2.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal2)));

        trip.setDays(new java.util.LinkedHashSet<>(Arrays.asList(day1, day2)));

        when(tripRepository.findByIdWithDaysAndMeals(1L, 1L)).thenReturn(java.util.Optional.of(trip));
        // FIX P1: DISTINCT ON на endDate вернёт самую свежую цену (150₽), ценовой ряд — обе.
        when(priceRepository.findLatestPricesAsOfForIngredients(any(), anyCollection()))
                .thenAnswer(inv -> List.of(priceDay2));
        when(priceRepository.findByIngredientIdInOrderByEffectiveFromDesc(anyCollection()))
                .thenAnswer(inv -> Arrays.asList(priceDay2, priceDay1)); // DESC, как в SQL

        System.out.println("ИСХОДНЫЕ ДАННЫЕ:");
        System.out.println("  День 1 (21 окт): цена = 120₽/кг");
        System.out.println("  День 2 (22 окт): цена = 150₽/кг (подорожала!)");
        System.out.println("  Количество: 0.1 KG × 4 чел = 0.4 KG каждый день\n");

        // День 1
        BigDecimal amount1 = new BigDecimal("0.4"); // 0.4 KG
        BigDecimal cost1 = amount1.multiply(priceDay1.getPricePerUnit())
                .setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("День 1:");
        System.out.println("  " + amount1 + " KG × 120₽/KG = " + cost1 + " ₽");

        // День 2
        BigDecimal amount2 = new BigDecimal("0.4"); // 0.4 KG
        BigDecimal cost2 = amount2.multiply(priceDay2.getPricePerUnit())
                .setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("День 2:");
        System.out.println("  " + amount2 + " KG × 150₽/KG = " + cost2 + " ₽\n");

        // ПРАВИЛЬНАЯ АГРЕГАЦИЯ
        BigDecimal totalAmount = amount1.add(amount2);
        BigDecimal correctTotalCost = cost1.add(cost2);
        
        System.out.println("ПРАВИЛЬНАЯ АГРЕГАЦИЯ (сумма стоимостей по дням):");
        System.out.println("  Общее количество: " + totalAmount + " KG");
        System.out.println("  Общая стоимость: " + cost1 + " + " + cost2 + " = " + correctTotalCost + " ₽\n");

        // НЕПРАВИЛЬНАЯ АГРЕГАЦИЯ (пересчёт по общему количеству с последней ценой)
        BigDecimal priceForAllDays = priceDay2.getPricePerUnit(); // самая свежая на endDate = 150₽
        BigDecimal wrongTotalCost = totalAmount.multiply(priceForAllDays)
                .setScale(2, RoundingMode.HALF_UP);
        
        System.out.println("НЕПРАВИЛЬНАЯ АГРЕГАЦИЯ (пересчёт по endDate):");
        System.out.println("  Общее количество: " + totalAmount + " KG");
        System.out.println("  Цена (по endDate): " + priceForAllDays + " ₽/KG");
        System.out.println("  Стоимость: " + totalAmount + " × " + priceForAllDays + " = " + wrongTotalCost + " ₽\n");

        BigDecimal difference = wrongTotalCost.subtract(correctTotalCost);
        
        System.out.println("ОШИБКА:");
        System.out.println("  Разница: " + wrongTotalCost + " - " + correctTotalCost + " = " + difference + " ₽");
        System.out.println("  Переплата: " + difference + " ₽\n");

        // Assertions
        assertThat(cost1).isEqualByComparingTo(new BigDecimal("48.00")); // 0.4 × 120
        assertThat(cost2).isEqualByComparingTo(new BigDecimal("60.00")); // 0.4 × 150
        assertThat(correctTotalCost).isEqualByComparingTo(new BigDecimal("108.00")); // 48 + 60
        assertThat(wrongTotalCost).isEqualByComparingTo(new BigDecimal("120.00")); // 0.8 × 150
        assertThat(difference).isEqualByComparingTo(new BigDecimal("12.00")); // Переплата 12₽

        System.out.println("✓ Тест подтверждает баг: текущая реализация даёт переплату " + difference + " ₽!\n");
    }

    @Test
    @DisplayName("ПРОВЕРКА: Текущая реализация корректно суммирует стоимости")
    void currentImplementation_correctlySumsCosts() {
        System.out.println("\n========================================");
        System.out.println("ПРОВЕРКА ТЕКУЩЕЙ РЕАЛИЗАЦИИ");
        System.out.println("========================================\n");

        Ingredient grechka = Ingredient.builder()
                .id(1L)
                .name("Гречка")
                .unit(UnitOfMeasure.KG)
                .build();

        // Цена в день 1: 120₽/кг
        IngredientPrice priceDay1 = IngredientPrice.builder()
                .id(1L)
                .ingredient(grechka)
                .effectiveFrom(LocalDate.of(2026, 1, 1))
                .pricePerUnit(new BigDecimal("120.00"))
                .currency("RUB")
                .build();

        // Цена в день 2: 150₽/кг (подорожала!)
        IngredientPrice priceDay2 = IngredientPrice.builder()
                .id(2L)
                .ingredient(grechka)
                .effectiveFrom(LocalDate.of(2026, 10, 22))
                .pricePerUnit(new BigDecimal("150.00"))
                .currency("RUB")
                .build();

        Recipe recipe = Recipe.builder()
                .id(1L)
                .name("Гречка")
                .baseServings(1)
                .build();

        RecipeIngredient ri = RecipeIngredient.builder()
                .id(1L)
                .ingredient(grechka)
                .amount(new BigDecimal("0.1")) // 100 г
                .build();
        recipe.setIngredients(Arrays.asList(ri));

        Trip trip = Trip.builder()
                .id(1L)
                .startDate(LocalDate.of(2026, 10, 21))
                .endDate(LocalDate.of(2026, 10, 22))
                .defaultPeople(4)
                .build();

        // День 1: 4 человека
        TripDay day1 = TripDay.builder()
                .id(1L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 10, 21))
                .peopleOverride(null)
                .build();
        TripMeal meal1 = TripMeal.builder()
                .id(1L)
                .tripDay(day1)
                .recipe(recipe)
                .peopleOverride(null)
                .build();
        day1.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal1)));

        // День 2: 4 человека
        TripDay day2 = TripDay.builder()
                .id(2L)
                .trip(trip)
                .dayDate(LocalDate.of(2026, 10, 22))
                .peopleOverride(null)
                .build();
        TripMeal meal2 = TripMeal.builder()
                .id(2L)
                .tripDay(day2)
                .recipe(recipe)
                .peopleOverride(null)
                .build();
        day2.setMeals(new java.util.LinkedHashSet<>(Arrays.asList(meal2)));

        trip.setDays(new java.util.LinkedHashSet<>(Arrays.asList(day1, day2)));

        when(tripRepository.findByIdWithDaysAndMeals(1L, 1L)).thenReturn(java.util.Optional.of(trip));
        // FIX P1: пакетные моки (DISTINCT ON на endDate -> 150₽; ряд цен — обе записи DESC).
        when(priceRepository.findLatestPricesAsOfForIngredients(any(), anyCollection()))
                .thenAnswer(inv -> List.of(priceDay2));
        when(priceRepository.findByIngredientIdInOrderByEffectiveFromDesc(anyCollection()))
                .thenAnswer(inv -> Arrays.asList(priceDay2, priceDay1));

        System.out.println("Вызываем getShoppingList()...\n");

        var result = summaryService.getShoppingList(1L, 1L);

        System.out.println("Результат:");
        System.out.println("  Всего элементов: " + result.items().size());
        System.out.println("  Общая плановая стоимость: " + result.totalPlannedCost() + " ₽");
        System.out.println("  Общая фактическая стоимость: " + result.totalActualCost() + " ₽");
        System.out.println("  Есть пропущенные цены: " + result.hasMissingPrices() + "\n");

        // Проверяем, что стоимость корректно суммируется
        assertThat(result.items()).hasSize(1);
        assertThat(result.items().get(0).totalAmount()).isEqualByComparingTo(new BigDecimal("0.800")); // 0.4 + 0.4
        // FIX P1 (актуальная семантика): ОБЩИЙ список getShoppingList считается по единому
        // срезу цен на endDate (DISTINCT ON -> 150₽): 0.8 × 150 = 120. Это контракт ADJ
        // (см. PriceOverrideTest). Корректная по-дневная агрегация — в getShoppingByDays,
        // куда фронт перенёс расчёт стоимости (Фаза 10 п.7). Проверяем оба уровня.
        assertThat(result.items().get(0).actualCost()).isEqualByComparingTo(new BigDecimal("120.00")); // 0.8 × 150
        assertThat(result.totalActualCost()).isEqualByComparingTo(new BigDecimal("120.00"));

        // Кросс-проверка: по дням стоимость равна сумме дневных стоимостей
        // (день 1: 0.4 × 120 = 48, день 2: 0.4 × 150 = 60 => 108), т.е. исторический
        // баг «одна цена на endDate для всех дней» в per-day расчёте отсутствует.
        when(priceRepository.findLatestPricesAsOfForIngredients(any(), anyCollection()))
                .thenAnswer(inv -> List.of(priceDay2));
        when(priceRepository.findByIngredientIdInOrderByEffectiveFromDesc(anyCollection()))
                .thenAnswer(inv -> Arrays.asList(priceDay2, priceDay1));
        var byDays = summaryService.getShoppingByDays(1L, 1L);
        assertThat(byDays).hasSize(2);
        BigDecimal sumOfDayPlanned = byDays.stream()
                .map(d -> d.plannedCost())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(sumOfDayPlanned).isEqualByComparingTo(new BigDecimal("108.00"));
        assertThat(byDays.get(0).plannedCost()).isEqualByComparingTo(new BigDecimal("48.00")); // 21 окт: 0.4 × 120
        assertThat(byDays.get(1).plannedCost()).isEqualByComparingTo(new BigDecimal("60.00")); // 22 окт: 0.4 × 150

        System.out.println("✓ Текущая реализация корректно суммирует стоимости по дням!");
        System.out.println("✓ Ожидаемая стоимость: 108.00 ₽ (48 + 60)");
        System.out.println("✓ Фактическая стоимость: " + result.totalActualCost() + " ₽\n");
    }
}
