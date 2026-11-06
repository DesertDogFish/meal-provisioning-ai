package com.provision.service;

import com.provision.dto.summary.DayShoppingResponse;
import com.provision.dto.summary.ShoppingItemResponse;
import com.provision.dto.summary.ShoppingListResponse;
import com.provision.entity.IngredientPrice;
import com.provision.entity.Recipe;
import com.provision.entity.Trip;
import com.provision.entity.TripDay;
import com.provision.entity.TripIngredientSubstitution;
import com.provision.entity.TripManualItem;
import com.provision.entity.TripMeal;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.TripManualItemRepository;
import lombok.RequiredArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Подзадача 12 (план plans/done/2026-10-29-full-audit.md): расчёт закупки похода —
 * общий список + по дням + калории/человеко-приёмы (выделено из SummaryService,
 * логика сохранена дословно). Граф похода и гидратированные составы рецептов
 * передаёт вызывающий (SummaryService.loadCalculationContext — один транзакционный
 * batch-обход); калькулятор лишь дочитывает цены/оверрайды/ручные позиции.
 *
 * <p>Инварианты (Known Bug #1, Фаза 14): план/факт общего списка = Σ по дням
 * qty_day × цена дня; итоги — целые рубли (roundToRub), позиции и цены за ед. — точные.
 */
@RequiredArgsConstructor
final class ShoppingListCalculator {

    private final IngredientPriceRepository priceRepository;
    private final PriceResolutionService priceResolutionService;
    private final TripIngredientEditService tripIngredientEditService;

    SummaryService.ShoppingComputation compute(Trip trip, TripCalculationContext ctx, Long tripId,
                                               TripManualItemRepository manualItemRepository) {
        ShoppingListValidator.validate(trip, ctx, tripId);
        Map<Long, BigDecimal> overrides = priceResolutionService.getAllOverrides(tripId);

        Map<Long, ShoppingAggregation> aggregation = new LinkedHashMap<>();
        int totalPersonMeals = 0;
        BigDecimal totalCalories = BigDecimal.ZERO;

        // Фаза 14 (N3): пер-походные правки состава (замены/добавления/удаления),
        // применяются ДО агрегации по ингредиентам. Рецепт в каталоге не трогается.
        TripIngredientEditService.TripEditBundle edits = ctx.edits();

        // FIX Known Bug #1: количества агрегируются ПО ДНЯМ (dayDate -> ingredientId -> agg),
        // чтобы плановая стоимость общего списка считалась как Σ qty_day × planPrice(day),
        // а не «одна цена на endDate для всего похода» (см. getShoppingByDays — там тот же
        // механизм: basePrices + priceSeries + effectivePriceFromCache).
        Map<LocalDate, Map<Long, ShoppingAggregation>> perDayAggregation = new LinkedHashMap<>();

        for (TripDay day : trip.getDays()) {
            Map<Long, ShoppingAggregation> dayAgg =
                    perDayAggregation.computeIfAbsent(day.getDayDate(), k -> new LinkedHashMap<>());
            for (TripMeal meal : day.getMeals()) {
                int mealPeople = MealPlanCalculator.calculateEffectivePeople(trip, day, meal);
                totalPersonMeals += mealPeople;
                Recipe recipe = meal.getRecipe();
                if (recipe.getCaloriesPerServing() != null) {
                    totalCalories = totalCalories.add(
                            BigDecimal.valueOf(recipe.getCaloriesPerServing())
                                    .multiply(BigDecimal.valueOf(mealPeople)));
                }

                List<TripIngredientEditService.EffectiveLine> lines = tripIngredientEditService.applyEdits(
                        tripId, recipe, recipe.getIngredients(),
                        edits.subsFor(recipe.getId()), edits.addedFor(recipe.getId()));

                for (TripIngredientEditService.EffectiveLine line : lines) {
                    // EXTRA (absolute) — количество на приём «как есть» (spec §3): не масштабируется.
                    BigDecimal mealAmount = line.absolute()
                            ? ShoppingRounding.scaleAmount(line.amountPerServing())
                            : MealPlanCalculator.calculateAmountForMeal(
                                    line.amountPerServing(),
                                    recipe.getBaseServings(),
                                    mealPeople
                            );

                    ShoppingAggregation agg = dayAgg.computeIfAbsent(line.ingredient().getId(), k ->
                            new ShoppingAggregation(line.ingredient()));
                    agg.addAmount(mealAmount);
                    if (agg.substitutedFromName == null && line.substitutedFromName() != null) {
                        agg.substitutedFromName = line.substitutedFromName();
                    }
                    // Плоская карта — только ради порядка ингредиентов и их объектов
                    // (упаковки/имя); суммы считаются по дням ниже.
                    aggregation.computeIfAbsent(line.ingredient().getId(), k ->
                            new ShoppingAggregation(line.ingredient()));
                }
            }
        }

        // R3 (Fix-3): ручные позиции закупки (продукты к дню/походу вне блюд) —
        // участвуют в агрегации наравне с позициями блюд: дневные попадают в свой
        // день, походные (day_id IS NULL) — в последний день похода (плановая цена
        // этого дня = срез endDate, тот же механизм, что у общего списка).
        if (manualItemRepository != null) {
            List<TripManualItem> manualItems = manualItemRepository.findByTripIdWithRefs(tripId);
            if (!manualItems.isEmpty()) {
                LocalDate lastDay = trip.getDays().stream()
                        .map(TripDay::getDayDate)
                        .max(LocalDate::compareTo)
                        .orElse(trip.getEndDate());
                for (TripManualItem mi : manualItems) {
                    LocalDate key = mi.getDay() != null ? mi.getDay().getDayDate() : lastDay;
                    Map<Long, ShoppingAggregation> dayAgg =
                            perDayAggregation.computeIfAbsent(key, k -> new LinkedHashMap<>());
                    ShoppingAggregation agg = dayAgg.computeIfAbsent(
                            mi.getIngredient().getId(), k -> new ShoppingAggregation(mi.getIngredient()));
                    agg.addAmount(mi.getAmount());
                    aggregation.computeIfAbsent(
                            mi.getIngredient().getId(), k -> new ShoppingAggregation(mi.getIngredient()));
                }
            }
        }

        // --- Общий список покупок (сборка делегирована в ShoppingListAssembler) ---

        // FIX P1 (аудит): раньше findEffectivePrice вызывался внутри цикла по каждому
        // ингредиенту — N+1. Теперь плановые цены на дату окончания грузятся одним пакетным
        // запросом DISTINCT ON; оверрайды и так уже в памяти (getAllOverrides).
        Map<Long, IngredientPrice> plannedPricesByIngredient = loadLatestPrices(
                aggregation.keySet(), trip.getEndDate());

        // FIX Known Bug #1: ценовые ряды нужны только тем ингредиентам, чей срез на endDate
        // датируется позже startDate (иначе одна и та же цена действовала все дни — поправка
        // не требуется). Один пакетный запрос вместо per-day/per-ingredient обращений к БД.
        Set<Long> needHistoryOverall = new HashSet<>();
        for (Map.Entry<Long, IngredientPrice> e : plannedPricesByIngredient.entrySet()) {
            if (e.getValue().getEffectiveFrom().isAfter(trip.getStartDate())) {
                needHistoryOverall.add(e.getKey());
            }
        }
        Map<Long, List<IngredientPrice>> overallPriceSeries = new HashMap<>();
        if (!needHistoryOverall.isEmpty()) {
            for (IngredientPrice p : priceRepository.findByIngredientIdInOrderByEffectiveFromDesc(needHistoryOverall)) {
                overallPriceSeries.computeIfAbsent(p.getIngredient().getId(), k -> new ArrayList<>()).add(p);
            }
        }

        ShoppingListAssembler.OverallResult overall = ShoppingListAssembler.assembleOverall(
                aggregation, perDayAggregation, overrides, plannedPricesByIngredient, overallPriceSeries);

        BigDecimal deltaPercent = ShoppingListAssembler.calculateDeltaPercent(overall.totalPlannedCost(), overall.totalActualCost());

        ShoppingListResponse shoppingList = ShoppingListAssembler.assembleShoppingList(
                overall.items(), overall.totalPlannedCost(), overall.totalActualCost(), deltaPercent,
                overall.overriddenCount(), overall.hasMissingPrices(), overall.missingIngredients());

        Set<Long> allIngredientIds = new HashSet<>();
        for (Recipe r : ctx.recipesById().values()) {
            if (r.getIngredients() != null) r.getIngredients().forEach(ri -> allIngredientIds.add(ri.getIngredient().getId()));
        }
        for (Map<Long, TripIngredientSubstitution> subs : edits.substitutionsByRecipeAndFrom().values())
            for (TripIngredientSubstitution sub : subs.values()) if (sub.getToIngredient() != null) allIngredientIds.add(sub.getToIngredient().getId());
        for (List<TripIngredientSubstitution> added : edits.addedByRecipe().values())
            for (TripIngredientSubstitution a : added) if (a.getToIngredient() != null) allIngredientIds.add(a.getToIngredient().getId());

        Map<Long, IngredientPrice> basePrices = loadLatestPrices(allIngredientIds, trip.getEndDate());
        Map<Long, List<IngredientPrice>> priceSeries = new HashMap<>();
        if (!allIngredientIds.isEmpty()) {
            Set<Long> needHistory = new HashSet<>();
            for (Map.Entry<Long, IngredientPrice> e : basePrices.entrySet())
                if (e.getValue().getEffectiveFrom().isAfter(trip.getStartDate())) needHistory.add(e.getKey());
            if (!needHistory.isEmpty())
                for (IngredientPrice p : priceRepository.findByIngredientIdInOrderByEffectiveFromDesc(needHistory))
                    priceSeries.computeIfAbsent(p.getIngredient().getId(), k -> new ArrayList<>()).add(p);
        }

        List<DayShoppingResponse> byDays = ShoppingListAssembler.assembleByDays(
                trip, ctx, tripIngredientEditService, edits, overrides, basePrices, priceSeries);

        return new SummaryService.ShoppingComputation(shoppingList, byDays, totalPersonMeals, totalCalories);
    }

    /**
     * FIX P1 (аудит): пакетная загрузка последней действующей на date цены для каждого
     * ингредиента из набора — один DISTINCT ON запрос вместо N вызовов findEffectivePrice.
     * Возвращает map ingredientId -> IngredientPrice; ингредиенты без цен в мапе отсутствуют.
     */
    private Map<Long, IngredientPrice> loadLatestPrices(Collection<Long> ingredientIds, LocalDate date) {
        if (ingredientIds == null || ingredientIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, IngredientPrice> result = new HashMap<>();
        for (IngredientPrice p : priceRepository.findLatestPricesAsOfForIngredients(date, ingredientIds)) {
            // DISTINCT ON + ORDER BY effective_from DESC => первая запись на ингредиент — самая свежая.
            result.putIfAbsent(p.getIngredient().getId(), p);
        }
        return result;
    }

    /**
     * Эффективная цена на dayDate из кэша (без обращения к БД).
     * basePrice — срез на endDate похода; если он датируется позже dayDate, берём из
     * ценового ряда series (отсортирован DESC) первый элемент с effectiveFrom <= dayDate.
     */
    private Optional<IngredientPrice> effectivePriceFromCache(
            Long ingredientId,
            LocalDate dayDate,
            Map<Long, IngredientPrice> basePrices,
            Map<Long, List<IngredientPrice>> series) {
        IngredientPrice base = basePrices.get(ingredientId);
        if (base == null || !base.getEffectiveFrom().isAfter(dayDate)) {
            return Optional.ofNullable(base);
        }
        // Срез на endDate ещё не действовал на дату дня — спускаемся по ряду к более раннему срезу.
        List<IngredientPrice> history = series.get(ingredientId);
        if (history != null) {
            for (IngredientPrice p : history) {
                if (!p.getEffectiveFrom().isAfter(dayDate)) {
                    return Optional.of(p);
                }
            }
        }
        return Optional.empty();
    }
}
