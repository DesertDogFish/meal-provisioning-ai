package com.provision.service;

import com.provision.dto.summary.*;
import com.provision.entity.*;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class SummaryService {

    private final TripRepository tripRepository;
    private final IngredientPriceRepository priceRepository;
    private final RecipeRepository recipeRepository;

    /**
     * Расчёт эффективного количества людей для приёма пищи
     * mealPeople = meal.peopleOverride ?? day.peopleOverride ?? trip.defaultPeople
     */
    public int calculateEffectivePeople(Trip trip, TripDay day, TripMeal meal) {
        if (meal != null && meal.getPeopleOverride() != null) {
            return meal.getPeopleOverride();
        }
        if (day != null && day.getPeopleOverride() != null) {
            return day.getPeopleOverride();
        }
        return trip.getDefaultPeople();
    }

    /**
     * Расчёт количества ингредиента на одного человека
     * perPersonAmount = ingredient.amount / recipe.baseServings
     */
    public BigDecimal calculateAmountPerPerson(BigDecimal amount, int baseServings) {
        return amount.divide(BigDecimal.valueOf(baseServings), 6, RoundingMode.HALF_UP);
    }

    /**
     * Расчёт количества ингредиента на приём пищи
     * mealAmount = perPersonAmount * people
     */
    public BigDecimal calculateAmountForMeal(BigDecimal amount, int baseServings, int people) {
        return calculateAmountPerPerson(amount, baseServings)
                .multiply(BigDecimal.valueOf(people))
                .setScale(3, RoundingMode.HALF_UP);
    }

    /**
     * Поиск цены на дату (последняя цена, где effectiveFrom <= date)
     */
    public Optional<IngredientPrice> findPriceForDate(Long ingredientId, LocalDate date) {
        return priceRepository.findEffectivePrice(ingredientId, date);
    }

    /**
     * Меню по дням
     */
    public List<MenuByDayResponse> getMenuByDays(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new IllegalArgumentException("Trip not found or access denied");
        }

        return trip.getDays().stream()
                .map(day -> {
                    int effectivePeople = calculateEffectivePeople(trip, day, null);
                    List<MenuByDayResponse.MenuMealResponse> meals = day.getMeals().stream()
                            .map(meal -> {
                                int mealPeople = calculateEffectivePeople(trip, day, meal);
                                Recipe recipe = meal.getRecipe();
                                
                                List<MenuByDayResponse.MenuMealResponse.MenuIngredientResponse> ingredients = 
                                        recipe.getIngredients().stream()
                                                .map(ri -> {
                                                    BigDecimal amount = calculateAmountForMeal(
                                                            ri.getAmount(),
                                                            recipe.getBaseServings(),
                                                            mealPeople
                                                    );
                                                    return new MenuByDayResponse.MenuMealResponse.MenuIngredientResponse(
                                                            ri.getIngredient().getName(),
                                                            amount,
                                                            ri.getIngredient().getUnit()
                                                    );
                                                })
                                                .toList();

                                return new MenuByDayResponse.MenuMealResponse(
                                        meal.getMealType().name(),
                                        recipe.getName(),
                                        mealPeople,
                                        ingredients
                                );
                            })
                            .toList();

                    return new MenuByDayResponse(
                            day.getDayDate().toString(),
                            effectivePeople,
                            meals
                    );
                })
                .toList();
    }

    /**
     * Закупка на весь поход
     */
    public ShoppingListResponse getShoppingList(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new IllegalArgumentException("Trip not found or access denied");
        }

        // Агрегация по ингредиентам с учётом стоимости по дням
        Map<Long, ShoppingAggregationWithCost> aggregation = new LinkedHashMap<>();

        for (TripDay day : trip.getDays()) {
            for (TripMeal meal : day.getMeals()) {
                int mealPeople = calculateEffectivePeople(trip, day, meal);
                Recipe recipe = meal.getRecipe();

                for (RecipeIngredient ri : recipe.getIngredients()) {
                    BigDecimal mealAmount = calculateAmountForMeal(
                            ri.getAmount(),
                            recipe.getBaseServings(),
                            mealPeople
                    );

                    // Получаем цену на дату этого дня
                    Optional<IngredientPrice> price = priceRepository
                            .findEffectivePrice(ri.getIngredient().getId(), day.getDayDate());

                    BigDecimal mealCost = null;
                    if (price.isPresent()) {
                        mealCost = mealAmount.multiply(price.get().getPricePerUnit())
                                .setScale(2, RoundingMode.HALF_UP);
                    }

                    aggregation.computeIfAbsent(ri.getIngredient().getId(), k -> 
                            new ShoppingAggregationWithCost(ri.getIngredient()))
                            .addAmountAndCost(mealAmount, mealCost);
                }
            }
        }

        // Формируем ответ
        List<ShoppingItemResponse> items = new ArrayList<>();
        BigDecimal totalCost = BigDecimal.ZERO;
        boolean hasMissingPrices = false;
        List<String> missingIngredients = new ArrayList<>();

        for (ShoppingAggregationWithCost agg : aggregation.values()) {
            BigDecimal estimatedCost = null;
            boolean hasPrice = false;

            if (agg.hasPrice()) {
                estimatedCost = agg.totalCost();
                hasPrice = true;
                totalCost = totalCost.add(estimatedCost);
            } else {
                hasMissingPrices = true;
                missingIngredients.add(agg.ingredient().getName());
            }

            items.add(new ShoppingItemResponse(
                    agg.ingredient().getId(),
                    agg.ingredient().getName(),
                    agg.ingredient().getUnit(),
                    agg.totalAmount(),
                    estimatedCost,
                    hasPrice
            ));
        }

        return new ShoppingListResponse(items, totalCost, hasMissingPrices, missingIngredients);
    }

    /**
     * Закупка по дням
     */
    public List<DayShoppingResponse> getShoppingByDays(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new IllegalArgumentException("Trip not found or access denied");
        }

        return trip.getDays().stream()
                .map(day -> {
                    Map<Long, ShoppingAggregation> dayAggregation = new LinkedHashMap<>();
                    BigDecimal dayCost = BigDecimal.ZERO;
                    boolean hasMissingPrices = false;

                    for (TripMeal meal : day.getMeals()) {
                        int mealPeople = calculateEffectivePeople(trip, day, meal);
                        Recipe recipe = meal.getRecipe();

                        for (RecipeIngredient ri : recipe.getIngredients()) {
                            BigDecimal mealAmount = calculateAmountForMeal(
                                    ri.getAmount(),
                                    recipe.getBaseServings(),
                                    mealPeople
                            );

                            dayAggregation.computeIfAbsent(ri.getIngredient().getId(), k -> 
                                    new ShoppingAggregation(ri.getIngredient()))
                                    .addAmount(mealAmount);
                        }
                    }

                    List<ShoppingItemResponse> items = new ArrayList<>();
                    for (ShoppingAggregation agg : dayAggregation.values()) {
                        BigDecimal estimatedCost = null;
                        boolean hasPrice = false;

                        Optional<IngredientPrice> price = priceRepository
                                .findEffectivePrice(agg.ingredient().getId(), day.getDayDate());

                        if (price.isPresent()) {
                            estimatedCost = agg.totalAmount().multiply(price.get().getPricePerUnit())
                                    .setScale(2, RoundingMode.HALF_UP);
                            hasPrice = true;
                            dayCost = dayCost.add(estimatedCost);
                        } else {
                            hasMissingPrices = true;
                        }

                        items.add(new ShoppingItemResponse(
                                agg.ingredient().getId(),
                                agg.ingredient().getName(),
                                agg.ingredient().getUnit(),
                                agg.totalAmount(),
                                estimatedCost,
                                hasPrice
                        ));
                    }

                    return new DayShoppingResponse(
                            day.getDayDate().toString(),
                            items,
                            dayCost,
                            hasMissingPrices
                    );
                })
                .toList();
    }

    /**
     * Сводка на человека
     */
    public PersonSummaryResponse getPersonSummary(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new IllegalArgumentException("Trip not found or access denied");
        }

        ShoppingListResponse shoppingList = getShoppingList(tripId, userId);
        
        // Расчёт totalPersonMeals
        int totalPersonMeals = 0;
        BigDecimal totalCalories = BigDecimal.ZERO;
        
        for (TripDay day : trip.getDays()) {
            for (TripMeal meal : day.getMeals()) {
                int mealPeople = calculateEffectivePeople(trip, day, meal);
                totalPersonMeals += mealPeople;
                
                if (meal.getRecipe().getCaloriesPerServing() != null) {
                    totalCalories = totalCalories.add(
                            BigDecimal.valueOf(meal.getRecipe().getCaloriesPerServing())
                                    .multiply(BigDecimal.valueOf(mealPeople))
                    );
                }
            }
        }

        // Расчёт на человека
        List<PersonSummaryResponse.PersonIngredientResponse> ingredients = shoppingList.items().stream()
                .map(item -> {
                    BigDecimal amountPerDefaultPerson = item.totalAmount()
                            .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 3, RoundingMode.HALF_UP);
                    
                    BigDecimal amountPerPersonMeal = totalPersonMeals > 0
                            ? item.totalAmount().divide(BigDecimal.valueOf(totalPersonMeals), 3, RoundingMode.HALF_UP)
                            : BigDecimal.ZERO;
                    
                    BigDecimal costPerDefaultPerson = item.estimatedCost() != null
                            ? item.estimatedCost().divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal costPerPersonMeal = item.estimatedCost() != null && totalPersonMeals > 0
                            ? item.estimatedCost().divide(BigDecimal.valueOf(totalPersonMeals), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    return new PersonSummaryResponse.PersonIngredientResponse(
                            item.ingredientName(),
                            item.unit(),
                            amountPerDefaultPerson,
                            amountPerPersonMeal,
                            costPerDefaultPerson,
                            costPerPersonMeal
                    );
                })
                .toList();

        BigDecimal costPerDefaultPerson = shoppingList.totalCost()
                .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP);
        
        BigDecimal costPerPersonMeal = totalPersonMeals > 0
                ? shoppingList.totalCost().divide(BigDecimal.valueOf(totalPersonMeals), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        
        BigDecimal caloriesPerPersonMeal = totalPersonMeals > 0
                ? totalCalories.divide(BigDecimal.valueOf(totalPersonMeals), 0, RoundingMode.HALF_UP)
                : null;

        TripSummaryResponse tripSummary = new TripSummaryResponse(
                shoppingList.totalCost(),
                shoppingList.hasMissingPrices(),
                shoppingList.missingIngredients(),
                totalPersonMeals,
                costPerDefaultPerson,
                costPerPersonMeal,
                caloriesPerPersonMeal
        );

        return new PersonSummaryResponse(ingredients, tripSummary);
    }

    /**
     * Вспомогательный класс для агрегации
     */
    private record ShoppingAggregation(Ingredient ingredient) {
        private BigDecimal totalAmount = BigDecimal.ZERO;

        void addAmount(BigDecimal amount) {
            totalAmount = totalAmount.add(amount);
        }
    }

    /**
     * Вспомогательный класс для агрегации с учётом стоимости по дням
     */
    private record ShoppingAggregationWithCost(Ingredient ingredient) {
        private BigDecimal totalAmount = BigDecimal.ZERO;
        private BigDecimal totalCost = BigDecimal.ZERO;
        private boolean hasAnyPrice = false;

        void addAmountAndCost(BigDecimal amount, BigDecimal cost) {
            totalAmount = totalAmount.add(amount);
            if (cost != null) {
                totalCost = totalCost.add(cost);
                hasAnyPrice = true;
            }
        }

        boolean hasPrice() {
            return hasAnyPrice;
        }
    }
}
