package com.provision.service;

import com.provision.dto.summary.DayShoppingResponse;
import com.provision.dto.summary.ShoppingItemResponse;
import com.provision.dto.summary.ShoppingListResponse;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.entity.Trip;
import com.provision.entity.TripMeal;
import com.provision.entity.Recipe;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class ShoppingListAssembler {
    private ShoppingListAssembler() {}

    record PackCalculation(BigDecimal packSize, Integer packsToBuy,
                          BigDecimal buyAmount, BigDecimal leftoverAmount) {}

    record OverallResult(
        List<ShoppingItemResponse> items,
        BigDecimal totalPlannedCost,
        BigDecimal totalActualCost,
        int overriddenCount,
        boolean hasMissingPrices,
        List<String> missingIngredients) {}

    static PackCalculation calculatePacks(Ingredient ingredient, BigDecimal totalAmount) {
        BigDecimal packSize = ingredient.getPackSize();
        if (packSize == null || packSize.compareTo(BigDecimal.ZERO) <= 0) {
            return new PackCalculation(packSize, null, null, null);
        }
        if (!Boolean.TRUE.equals(ingredient.getRoundToPacks())) {
            return new PackCalculation(packSize, null, null, null);
        }
        int packsToBuy = totalAmount.divide(packSize, 0, RoundingMode.CEILING).intValue();
        BigDecimal buyAmount = ShoppingRounding.scaleAmount(packSize.multiply(BigDecimal.valueOf(packsToBuy)));
        BigDecimal leftover = ShoppingRounding.scaleAmount(buyAmount.subtract(totalAmount));
        return new PackCalculation(packSize, packsToBuy, buyAmount, leftover);
    }

    static BigDecimal calculateDeltaPercent(BigDecimal planned, BigDecimal actual) {
        if (planned.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO.setScale(ShoppingRounding.DELTA_FINAL_SCALE, ShoppingRounding.MODE);
        }
        return ShoppingRounding.scaleMoney(
                ShoppingRounding.divideAmount(actual.subtract(planned), planned, ShoppingRounding.DELTA_INTERMEDIATE_SCALE)
                        .multiply(BigDecimal.valueOf(100)));
    }

    static OverallResult assembleOverall(
        Map<Long, ShoppingAggregation> aggregation,
        Map<LocalDate, Map<Long, ShoppingAggregation>> perDayAggregation,
        Map<Long, BigDecimal> overrides,
        Map<Long, IngredientPrice> plannedPricesByIngredient,
        Map<Long, List<IngredientPrice>> overallPriceSeries) {
        List<ShoppingItemResponse> items = new ArrayList<>();
        BigDecimal totalPlannedCost = BigDecimal.ZERO;
        BigDecimal totalActualCost = BigDecimal.ZERO;
        boolean hasMissingPrices = false;
        List<String> missingIngredients = new ArrayList<>();
        int overriddenCount = 0;

        for (ShoppingAggregation aggProto : aggregation.values()) {
            Long ingredientId = aggProto.ingredient().getId();
            BigDecimal overridePrice = overrides.get(ingredientId);

            BigDecimal totalAmount = BigDecimal.ZERO;
            BigDecimal plannedCost = null;
            BigDecimal actualCost = null;
            String substitutedFromName = null;
            boolean itemHasPlannedPrice = false;
            boolean itemHasActualPrice = false;

            for (Map.Entry<LocalDate, Map<Long, ShoppingAggregation>> dayEntry : perDayAggregation.entrySet()) {
                ShoppingAggregation dayAgg = dayEntry.getValue().get(ingredientId);
                if (dayAgg == null) continue;
                totalAmount = totalAmount.add(dayAgg.totalAmount());
                if (substitutedFromName == null) substitutedFromName = dayAgg.substitutedFromName;

                BigDecimal dayPlannedUnitPrice = effectivePriceFromCache(
                        ingredientId, dayEntry.getKey(), plannedPricesByIngredient, overallPriceSeries)
                        .map(IngredientPrice::getPricePerUnit).orElse(null);
                if (dayPlannedUnitPrice != null) {
                    itemHasPlannedPrice = true;
                    BigDecimal dayPlanned = ShoppingRounding.scaleMoney(dayAgg.totalAmount().multiply(dayPlannedUnitPrice));
                    plannedCost = (plannedCost == null) ? dayPlanned : plannedCost.add(dayPlanned);
                }
                BigDecimal dayActualUnitPrice = overridePrice != null ? overridePrice : dayPlannedUnitPrice;
                if (dayActualUnitPrice != null) {
                    itemHasActualPrice = true;
                    BigDecimal dayActual = ShoppingRounding.scaleMoney(dayAgg.totalAmount().multiply(dayActualUnitPrice));
                    actualCost = (actualCost == null) ? dayActual : actualCost.add(dayActual);
                }
            }

            boolean overridden = overridePrice != null;
            BigDecimal plannedUnitPrice = (plannedCost != null && totalAmount.signum() > 0)
                    ? ShoppingRounding.divideMoney(plannedCost, totalAmount)
                    : (plannedPricesByIngredient.get(ingredientId) != null
                            ? plannedPricesByIngredient.get(ingredientId).getPricePerUnit() : null);
            BigDecimal actualUnitPrice = (actualCost != null && totalAmount.signum() > 0)
                    ? ShoppingRounding.divideMoney(actualCost, totalAmount)
                    : (overridden ? overridePrice : plannedUnitPrice);

            if (itemHasPlannedPrice) {
                totalPlannedCost = totalPlannedCost.add(plannedCost);
            } else if (overridePrice == null) {
                hasMissingPrices = true;
                missingIngredients.add(aggProto.ingredient().getName());
            }
            if (itemHasActualPrice) totalActualCost = totalActualCost.add(actualCost);
            if (overridden) overriddenCount++;

            PackCalculation packs = calculatePacks(aggProto.ingredient(), totalAmount);
            items.add(new ShoppingItemResponse(
                    ingredientId, aggProto.ingredient().getName(), aggProto.ingredient().getUnit(),
                    totalAmount, plannedUnitPrice, actualUnitPrice, plannedCost, actualCost, overridden,
                    itemHasPlannedPrice, packs.packSize(), packs.packsToBuy(), packs.buyAmount(),
                    packs.leftoverAmount(), substitutedFromName));
        }

        return new OverallResult(items, totalPlannedCost, totalActualCost, overriddenCount, hasMissingPrices, missingIngredients);
    }

    static List<DayShoppingResponse> assembleByDays(
        Trip trip,
        TripCalculationContext ctx,
        TripIngredientEditService tripIngredientEditService,
        TripIngredientEditService.TripEditBundle edits,
        Map<Long, BigDecimal> overrides,
        Map<Long, IngredientPrice> basePrices,
        Map<Long, List<IngredientPrice>> priceSeries) {
        return trip.getDays().stream().map(day -> {
            Map<Long, ShoppingAggregation> dayAggregation = new LinkedHashMap<>();
            BigDecimal dayPlannedCost = BigDecimal.ZERO;
            BigDecimal dayActualCost = BigDecimal.ZERO;
            boolean dayHasMissingPrices = false;
            LocalDate dayDate = day.getDayDate();

            for (TripMeal meal : day.getMeals()) {
                int mealPeople = MealPlanCalculator.calculateEffectivePeople(trip, day, meal);
                Recipe recipe = meal.getRecipe();
                List<TripIngredientEditService.EffectiveLine> lines = tripIngredientEditService.applyEdits(
                        trip.getId(), recipe, recipe.getIngredients(),
                        edits.subsFor(recipe.getId()), edits.addedFor(recipe.getId()));
                for (TripIngredientEditService.EffectiveLine line : lines) {
                    BigDecimal mealAmount = line.absolute()
                            ? ShoppingRounding.scaleAmount(line.amountPerServing())
                            : MealPlanCalculator.calculateAmountForMeal(line.amountPerServing(), recipe.getBaseServings(), mealPeople);
                    ShoppingAggregation agg = dayAggregation.computeIfAbsent(line.ingredient().getId(),
                            k -> new ShoppingAggregation(line.ingredient()));
                    agg.addAmount(mealAmount);
                    if (agg.substitutedFromName == null && line.substitutedFromName() != null) {
                        agg.substitutedFromName = line.substitutedFromName();
                    }
                }
            }

            List<ShoppingItemResponse> dayItems = new ArrayList<>();
            for (ShoppingAggregation agg : dayAggregation.values()) {
                Long ingredientId = agg.ingredient().getId();
                BigDecimal overridePrice = overrides.get(ingredientId);
                java.util.Optional<IngredientPrice> plannedPriceOpt = effectivePriceFromCache(
                        ingredientId, dayDate, basePrices, priceSeries);
                BigDecimal plannedUnitPrice = plannedPriceOpt.map(IngredientPrice::getPricePerUnit).orElse(null);
                BigDecimal actualUnitPrice = overridePrice != null ? overridePrice : plannedUnitPrice;
                BigDecimal plannedCost = null;
                BigDecimal actualCost = null;
                boolean hasPlannedPrice = plannedUnitPrice != null;
                boolean overridden = overridePrice != null;
                if (hasPlannedPrice) {
                    plannedCost = ShoppingRounding.scaleMoney(agg.totalAmount().multiply(plannedUnitPrice));
                    dayPlannedCost = dayPlannedCost.add(plannedCost);
                } else if (overridePrice == null) {
                    dayHasMissingPrices = true;
                }
                if (actualUnitPrice != null) {
                    actualCost = ShoppingRounding.scaleMoney(agg.totalAmount().multiply(actualUnitPrice));
                    dayActualCost = dayActualCost.add(actualCost);
                }
                PackCalculation packs = calculatePacks(agg.ingredient(), agg.totalAmount());
                dayItems.add(new ShoppingItemResponse(ingredientId, agg.ingredient().getName(), agg.ingredient().getUnit(),
                        agg.totalAmount(), plannedUnitPrice, actualUnitPrice, plannedCost, actualCost, overridden,
                        hasPlannedPrice, packs.packSize(), packs.packsToBuy(), packs.buyAmount(), packs.leftoverAmount(),
                        agg.substitutedFromName));
            }
            return new DayShoppingResponse(day.getDayDate().toString(), dayItems,
                    ShoppingRounding.roundToRub(dayPlannedCost), ShoppingRounding.roundToRub(dayActualCost),
                    dayHasMissingPrices);
        }).toList();
    }

    static ShoppingListResponse assembleShoppingList(
        List<ShoppingItemResponse> items,
        BigDecimal totalPlannedCost,
        BigDecimal totalActualCost,
        BigDecimal deltaPercent,
        int overriddenCount,
        boolean hasMissingPrices,
        List<String> missingIngredients) {
        // Итоговые суммы на уровне API округляются до целых рублей (Фаза 14).
        return new ShoppingListResponse(items, ShoppingRounding.roundToRub(totalPlannedCost),
                ShoppingRounding.roundToRub(totalActualCost), deltaPercent,
                overriddenCount, hasMissingPrices, missingIngredients);
    }

    static DayShoppingResponse assembleDay(
        LocalDate dayDate,
        List<ShoppingItemResponse> items,
        BigDecimal dayPlannedCost,
        BigDecimal dayActualCost,
        boolean hasMissingPrices) {
        return new DayShoppingResponse(dayDate.toString(), items, ShoppingRounding.roundToRub(dayPlannedCost), ShoppingRounding.roundToRub(dayActualCost), hasMissingPrices);
    }

    // helper duplicated (package-private) for assembler internal use
    private static java.util.Optional<IngredientPrice> effectivePriceFromCache(
            Long ingredientId, LocalDate dayDate,
            Map<Long, IngredientPrice> basePrices,
            Map<Long, List<IngredientPrice>> series) {
        IngredientPrice base = basePrices.get(ingredientId);
        if (base == null || !base.getEffectiveFrom().isAfter(dayDate)) {
            return java.util.Optional.ofNullable(base);
        }
        List<IngredientPrice> history = series.get(ingredientId);
        if (history != null) {
            for (IngredientPrice p : history) {
                if (!p.getEffectiveFrom().isAfter(dayDate)) {
                    return java.util.Optional.of(p);
                }
            }
        }
        return java.util.Optional.empty();
    }
}
