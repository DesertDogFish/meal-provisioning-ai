package com.provision.service;

import com.provision.dto.summary.*;
import com.provision.entity.*;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class SummaryService {

    private final TripRepository tripRepository;
    private final IngredientPriceRepository priceRepository;
    private final RecipeRepository recipeRepository;
    private final PriceResolutionService priceResolutionService;
    private final TripIngredientSubstitutionRepository substitutionRepository;

    public int calculateEffectivePeople(Trip trip, TripDay day, TripMeal meal) {
        if (meal != null && meal.getPeopleOverride() != null) {
            return meal.getPeopleOverride();
        }
        if (day != null && day.getPeopleOverride() != null) {
            return day.getPeopleOverride();
        }
        return trip.getDefaultPeople();
    }

    public BigDecimal calculateAmountPerPerson(BigDecimal amount, int baseServings) {
        return amount.divide(BigDecimal.valueOf(baseServings), 6, RoundingMode.HALF_UP);
    }

    public BigDecimal calculateAmountForMeal(BigDecimal amount, int baseServings, int people) {
        return calculateAmountPerPerson(amount, baseServings)
                .multiply(BigDecimal.valueOf(people))
                .setScale(3, RoundingMode.HALF_UP);
    }

    public Optional<IngredientPrice> findPriceForDate(Long ingredientId, LocalDate date) {
        return priceRepository.findEffectivePrice(ingredientId, date);
    }

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

    public ShoppingListResponse getShoppingList(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new IllegalArgumentException("Trip not found or access denied");
        }

        Map<Long, BigDecimal> overrides = priceResolutionService.getAllOverrides(tripId);
        Map<Long, ShoppingAggregation> aggregation = new LinkedHashMap<>();

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

                    aggregation.computeIfAbsent(ri.getIngredient().getId(), k -> 
                            new ShoppingAggregation(ri.getIngredient()))
                            .addAmount(mealAmount);
                }
            }
        }

        List<ShoppingItemResponse> items = new ArrayList<>();
        BigDecimal totalPlannedCost = BigDecimal.ZERO;
        BigDecimal totalActualCost = BigDecimal.ZERO;
        boolean hasMissingPrices = false;
        List<String> missingIngredients = new ArrayList<>();
        int overriddenCount = 0;

        for (ShoppingAggregation agg : aggregation.values()) {
            Long ingredientId = agg.ingredient().getId();
            BigDecimal overridePrice = overrides.get(ingredientId);
            
            // Получаем плановую цену на дату окончания похода (для общей сводки)
            Optional<IngredientPrice> plannedPriceOpt = priceRepository
                    .findEffectivePrice(ingredientId, trip.getEndDate());
            
            BigDecimal plannedUnitPrice = plannedPriceOpt.map(IngredientPrice::getPricePerUnit).orElse(null);
            BigDecimal actualUnitPrice = overridePrice != null ? overridePrice : plannedUnitPrice;
            
            BigDecimal plannedCost = null;
            BigDecimal actualCost = null;
            boolean hasPlannedPrice = plannedUnitPrice != null;
            boolean overridden = overridePrice != null;

            if (hasPlannedPrice) {
                plannedCost = agg.totalAmount().multiply(plannedUnitPrice).setScale(2, RoundingMode.HALF_UP);
                totalPlannedCost = totalPlannedCost.add(plannedCost);
            } else if (overridePrice == null) {
                hasMissingPrices = true;
                missingIngredients.add(agg.ingredient().getName());
            }

            if (actualUnitPrice != null) {
                actualCost = agg.totalAmount().multiply(actualUnitPrice).setScale(2, RoundingMode.HALF_UP);
                totalActualCost = totalActualCost.add(actualCost);
            }

            if (overridden) {
                overriddenCount++;
            }

            items.add(new ShoppingItemResponse(
                    ingredientId,
                    agg.ingredient().getName(),
                    agg.ingredient().getUnit(),
                    agg.totalAmount(),
                    plannedUnitPrice,
                    actualUnitPrice,
                    plannedCost,
                    actualCost,
                    overridden,
                    hasPlannedPrice,
                    null,  // packSize
                    null,  // packsToBuy
                    null,  // buyAmount
                    null,  // leftoverAmount
                    null   // substitutedFrom
            ));
        }

        BigDecimal deltaPercent = calculateDeltaPercent(totalPlannedCost, totalActualCost);

        return new ShoppingListResponse(
                items,
                totalPlannedCost,
                totalActualCost,
                deltaPercent,
                overriddenCount,
                hasMissingPrices,
                missingIngredients
        );
    }

    public List<DayShoppingResponse> getShoppingByDays(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new IllegalArgumentException("Trip not found or access denied");
        }

        Map<Long, BigDecimal> overrides = priceResolutionService.getAllOverrides(tripId);

        return trip.getDays().stream()
                .map(day -> {
                    Map<Long, ShoppingAggregation> dayAggregation = new LinkedHashMap<>();
                    BigDecimal dayPlannedCost = BigDecimal.ZERO;
                    BigDecimal dayActualCost = BigDecimal.ZERO;
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
                        Long ingredientId = agg.ingredient().getId();
                        BigDecimal overridePrice = overrides.get(ingredientId);
                        
                        Optional<IngredientPrice> plannedPriceOpt = priceRepository
                                .findEffectivePrice(ingredientId, day.getDayDate());
                        
                        BigDecimal plannedUnitPrice = plannedPriceOpt.map(IngredientPrice::getPricePerUnit).orElse(null);
                        BigDecimal actualUnitPrice = overridePrice != null ? overridePrice : plannedUnitPrice;
                        
                        BigDecimal plannedCost = null;
                        BigDecimal actualCost = null;
                        boolean hasPlannedPrice = plannedUnitPrice != null;
                        boolean overridden = overridePrice != null;

                        if (hasPlannedPrice) {
                            plannedCost = agg.totalAmount().multiply(plannedUnitPrice).setScale(2, RoundingMode.HALF_UP);
                            dayPlannedCost = dayPlannedCost.add(plannedCost);
                        } else if (overridePrice == null) {
                            hasMissingPrices = true;
                        }

                        if (actualUnitPrice != null) {
                            actualCost = agg.totalAmount().multiply(actualUnitPrice).setScale(2, RoundingMode.HALF_UP);
                            dayActualCost = dayActualCost.add(actualCost);
                        }

                        items.add(new ShoppingItemResponse(
                                ingredientId,
                                agg.ingredient().getName(),
                                agg.ingredient().getUnit(),
                                agg.totalAmount(),
                                plannedUnitPrice,
                                actualUnitPrice,
                                plannedCost,
                                actualCost,
                                overridden,
                                hasPlannedPrice,
                                null,  // packSize
                                null,  // packsToBuy
                                null,  // buyAmount
                                null,  // leftoverAmount
                                null   // substitutedFrom
                        ));
                    }

                    return new DayShoppingResponse(
                            day.getDayDate().toString(),
                            items,
                            dayPlannedCost,
                            dayActualCost,
                            hasMissingPrices
                    );
                })
                .toList();
    }

    public PersonSummaryResponse getPersonSummary(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new IllegalArgumentException("Trip not found or access denied");
        }

        ShoppingListResponse shoppingList = getShoppingList(tripId, userId);
        
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

        List<PersonSummaryResponse.PersonIngredientResponse> ingredients = shoppingList.items().stream()
                .map(item -> {
                    BigDecimal amountPerDefaultPerson = item.totalAmount()
                            .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 3, RoundingMode.HALF_UP);
                    
                    BigDecimal amountPerPersonMeal = totalPersonMeals > 0
                            ? item.totalAmount().divide(BigDecimal.valueOf(totalPersonMeals), 3, RoundingMode.HALF_UP)
                            : BigDecimal.ZERO;
                    
                    BigDecimal plannedCostPerDefaultPerson = item.plannedCost() != null
                            ? item.plannedCost().divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal actualCostPerDefaultPerson = item.actualCost() != null
                            ? item.actualCost().divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal plannedCostPerPersonMeal = item.plannedCost() != null && totalPersonMeals > 0
                            ? item.plannedCost().divide(BigDecimal.valueOf(totalPersonMeals), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal actualCostPerPersonMeal = item.actualCost() != null && totalPersonMeals > 0
                            ? item.actualCost().divide(BigDecimal.valueOf(totalPersonMeals), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    return new PersonSummaryResponse.PersonIngredientResponse(
                            item.ingredientName(),
                            item.unit(),
                            amountPerDefaultPerson,
                            amountPerPersonMeal,
                            plannedCostPerDefaultPerson,
                            actualCostPerDefaultPerson,
                            plannedCostPerPersonMeal,
                            actualCostPerPersonMeal
                    );
                })
                .toList();

        BigDecimal plannedCostPerDefaultPerson = shoppingList.totalPlannedCost()
                .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP);
        
        BigDecimal actualCostPerDefaultPerson = shoppingList.totalActualCost()
                .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP);
        
        BigDecimal plannedCostPerPersonMeal = totalPersonMeals > 0
                ? shoppingList.totalPlannedCost().divide(BigDecimal.valueOf(totalPersonMeals), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        
        BigDecimal actualCostPerPersonMeal = totalPersonMeals > 0
                ? shoppingList.totalActualCost().divide(BigDecimal.valueOf(totalPersonMeals), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        
        BigDecimal caloriesPerPersonMeal = totalPersonMeals > 0
                ? totalCalories.divide(BigDecimal.valueOf(totalPersonMeals), 0, RoundingMode.HALF_UP)
                : null;

        TripSummaryResponse tripSummary = new TripSummaryResponse(
                shoppingList.totalPlannedCost(),
                shoppingList.totalActualCost(),
                shoppingList.deltaPercent(),
                shoppingList.overriddenCount(),
                shoppingList.hasMissingPrices(),
                shoppingList.missingIngredients(),
                totalPersonMeals,
                plannedCostPerDefaultPerson,
                actualCostPerDefaultPerson,
                plannedCostPerPersonMeal,
                actualCostPerPersonMeal,
                caloriesPerPersonMeal
        );

        return new PersonSummaryResponse(ingredients, tripSummary);
    }

    private BigDecimal calculateDeltaPercent(BigDecimal planned, BigDecimal actual) {
        if (planned.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return actual.subtract(planned)
                .divide(planned, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private static class ShoppingAggregation {
        private final Ingredient ingredient;
        private BigDecimal totalAmount = BigDecimal.ZERO;

        ShoppingAggregation(Ingredient ingredient) {
            this.ingredient = ingredient;
        }

        Ingredient ingredient() {
            return ingredient;
        }

        BigDecimal totalAmount() {
            return totalAmount;
        }

        void addAmount(BigDecimal amount) {
            totalAmount = totalAmount.add(amount);
        }
    }
}
