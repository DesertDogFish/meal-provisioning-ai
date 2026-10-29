package com.provision.service;

import com.provision.dto.summary.DayShoppingResponse;
import com.provision.dto.summary.ShoppingItemResponse;
import com.provision.dto.summary.ShoppingListResponse;
import com.provision.entity.Ingredient;
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
import java.math.RoundingMode;
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
 * Подзадача 12 (план plans/2026-10-29-full-audit.md): расчёт закупки похода —
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
                            ? line.amountPerServing().setScale(3, RoundingMode.HALF_UP)
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

        // --- Общий список покупок ---
        List<ShoppingItemResponse> items = new ArrayList<>();
        BigDecimal totalPlannedCost = BigDecimal.ZERO;
        BigDecimal totalActualCost = BigDecimal.ZERO;
        boolean hasMissingPrices = false;
        List<String> missingIngredients = new ArrayList<>();
        int overriddenCount = 0;

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

        for (ShoppingAggregation aggProto : aggregation.values()) {
            Long ingredientId = aggProto.ingredient().getId();
            BigDecimal overridePrice = overrides.get(ingredientId);

            BigDecimal totalAmount = BigDecimal.ZERO;
            BigDecimal plannedCost = null;   // Σ qty_day × planPrice(day) — Known Bug #1
            BigDecimal actualCost = null;    // Σ qty_day × actualPrice(day)
            String substitutedFromName = null;
            boolean itemHasPlannedPrice = false;
            boolean itemHasActualPrice = false;

            // Обход по дням (порядок = порядок дней похода), берём количество данного
            // ингредиента в каждом дне и его плановую цену на дату этого дня.
            for (Map.Entry<LocalDate, Map<Long, ShoppingAggregation>> dayEntry : perDayAggregation.entrySet()) {
                ShoppingAggregation dayAgg = dayEntry.getValue().get(ingredientId);
                if (dayAgg == null) {
                    continue;
                }
                totalAmount = totalAmount.add(dayAgg.totalAmount());
                if (substitutedFromName == null) {
                    substitutedFromName = dayAgg.substitutedFromName;
                }

                // Плановая цена на фактическую дату дня (не на endDate!) — тот же
                // механизм, что в getShoppingByDays: срез endDate + спуск по ряду.
                BigDecimal dayPlannedUnitPrice = effectivePriceFromCache(
                        ingredientId, dayEntry.getKey(),
                        plannedPricesByIngredient, overallPriceSeries)
                        .map(IngredientPrice::getPricePerUnit).orElse(null);
                if (dayPlannedUnitPrice != null) {
                    itemHasPlannedPrice = true;
                    BigDecimal dayPlanned = dayAgg.totalAmount().multiply(dayPlannedUnitPrice)
                            .setScale(2, RoundingMode.HALF_UP);
                    plannedCost = (plannedCost == null) ? dayPlanned : plannedCost.add(dayPlanned);
                }

                // Фактическая цена дня: ручной оверрайд единого курса нет (он глобальный
                // на поход), иначе — плановая цена этого дня.
                BigDecimal dayActualUnitPrice = overridePrice != null ? overridePrice : dayPlannedUnitPrice;
                if (dayActualUnitPrice != null) {
                    itemHasActualPrice = true;
                    BigDecimal dayActual = dayAgg.totalAmount().multiply(dayActualUnitPrice)
                            .setScale(2, RoundingMode.HALF_UP);
                    actualCost = (actualCost == null) ? dayActual : actualCost.add(dayActual);
                }
            }

            boolean overridden = overridePrice != null;
            // Средневзвешенная плановая цена за единицу = planCost / qty (scale 2).
            // При нулевом количестве оставляем срез на endDate (как раньше).
            BigDecimal plannedUnitPrice = (plannedCost != null && totalAmount.signum() > 0)
                    ? plannedCost.divide(totalAmount, 2, RoundingMode.HALF_UP)
                    : plannedPricesByIngredient.get(ingredientId) != null
                            ? plannedPricesByIngredient.get(ingredientId).getPricePerUnit()
                            : null;
            BigDecimal actualUnitPrice = (actualCost != null && totalAmount.signum() > 0)
                    ? actualCost.divide(totalAmount, 2, RoundingMode.HALF_UP)
                    : (overridden ? overridePrice : plannedUnitPrice);

            if (itemHasPlannedPrice) {
                totalPlannedCost = totalPlannedCost.add(plannedCost);
            } else if (overridePrice == null) {
                hasMissingPrices = true;
                missingIngredients.add(aggProto.ingredient().getName());
            }

            if (itemHasActualPrice) {
                totalActualCost = totalActualCost.add(actualCost);
            }

            if (overridden) {
                overriddenCount++;
            }

            PackCalculation packs = calculatePacks(aggProto.ingredient(), totalAmount);

            items.add(new ShoppingItemResponse(
                    ingredientId,
                    aggProto.ingredient().getName(),
                    aggProto.ingredient().getUnit(),
                    totalAmount,
                    plannedUnitPrice,
                    actualUnitPrice,
                    plannedCost,
                    actualCost,
                    overridden,
                    itemHasPlannedPrice,
                    packs.packSize(),      // FIX (P1): packSize из справочника
                    packs.packsToBuy(),    // FIX (P1): ceil(total/packSize) при roundToPacks
                    packs.buyAmount(),     // FIX (P1): сколько реально покупать
                    packs.leftoverAmount(),// FIX (P1): излишек
                    substitutedFromName    // Фаза 14: имя замещённого продукта (null = без замены)
            ));
        }

        BigDecimal deltaPercent = calculateDeltaPercent(totalPlannedCost, totalActualCost);

        // Фаза 14: итоговые суммы — целые рубли (позиции и цены за единицу остаются точными).
        ShoppingListResponse shoppingList = new ShoppingListResponse(
                items,
                MealPlanCalculator.roundToRub(totalPlannedCost),
                MealPlanCalculator.roundToRub(totalActualCost),
                deltaPercent,
                overriddenCount,
                hasMissingPrices,
                missingIngredients
        );

        // --- Покупки по дням ---
        // FIX P1 (аудит): пакетная загрузка цен вместо N+1 внутри цикла по дням.
        // 1) Один запрос DISTINCT ON на всю дату окончания — это нижняя грань:
        //    для любой даты внутри похода эффективная цена либо совпадает, либо старше.
        // 2) Собираем id всех ингредиентов рецептов похода и одним запросом тянем все
        //    их ценовые ряды в память; для дат раньше endDate корректируем эффективную
        //    цену pick'ом из ряда (иначе distinct-on вернул бы цену, ещё не действующую на день).
        Set<Long> allIngredientIds = new HashSet<>();
        for (Recipe r : ctx.recipesById().values()) {
            if (r.getIngredients() != null) {
                r.getIngredients().forEach(ri -> allIngredientIds.add(ri.getIngredient().getId()));
            }
        }

        // Фаза 14 (N3): id замещённых/добавленных продуктов тоже в ценовой набор
        for (Map<Long, TripIngredientSubstitution> subs : edits.substitutionsByRecipeAndFrom().values()) {
            for (TripIngredientSubstitution sub : subs.values()) {
                if (sub.getToIngredient() != null) allIngredientIds.add(sub.getToIngredient().getId());
            }
        }
        for (List<TripIngredientSubstitution> added : edits.addedByRecipe().values()) {
            for (TripIngredientSubstitution a : added) {
                if (a.getToIngredient() != null) allIngredientIds.add(a.getToIngredient().getId());
            }
        }

        LocalDate rangeEnd = trip.getEndDate();
        Map<Long, IngredientPrice> basePrices = loadLatestPrices(allIngredientIds, rangeEnd);
        Map<Long, List<IngredientPrice>> priceSeries = new HashMap<>();
        if (!allIngredientIds.isEmpty()) {
            // FIX P1: ценовые ряды нужны ТОЛЬКО для поправок на дни раньше endDate —
            // один пакетный запрос вместо скрытого N+1 (раньше грузился полный ряд на
            // каждый ингредиент похода, даже когда история цен не использовалась).
            Set<Long> needHistory = new HashSet<>();
            for (Map.Entry<Long, IngredientPrice> e : basePrices.entrySet()) {
                if (e.getValue().getEffectiveFrom().isAfter(trip.getStartDate())) {
                    needHistory.add(e.getKey());
                }
            }
            if (!needHistory.isEmpty()) {
                for (IngredientPrice p : priceRepository.findByIngredientIdInOrderByEffectiveFromDesc(needHistory)) {
                    priceSeries.computeIfAbsent(p.getIngredient().getId(), k -> new ArrayList<>()).add(p);
                }
            }
        }

        List<DayShoppingResponse> byDays = trip.getDays().stream()
                .map(day -> {
                    Map<Long, ShoppingAggregation> dayAggregation = new LinkedHashMap<>();
                    BigDecimal dayPlannedCost = BigDecimal.ZERO;
                    BigDecimal dayActualCost = BigDecimal.ZERO;
                    boolean dayHasMissingPrices = false;

                    LocalDate dayDate = day.getDayDate();

                    for (TripMeal meal : day.getMeals()) {
                        int mealPeople = MealPlanCalculator.calculateEffectivePeople(trip, day, meal);
                        Recipe recipe = meal.getRecipe();

                        // Тот же per-trip edits-bundle, что и в общей закупке (один раз на расчёт)
                        List<TripIngredientEditService.EffectiveLine> lines = tripIngredientEditService.applyEdits(
                                tripId, recipe, recipe.getIngredients(),
                                edits.subsFor(recipe.getId()), edits.addedFor(recipe.getId()));

                        for (TripIngredientEditService.EffectiveLine line : lines) {
                            // EXTRA (absolute) — количество на приём «как есть» (spec §3).
                            BigDecimal mealAmount = line.absolute()
                                    ? line.amountPerServing().setScale(3, RoundingMode.HALF_UP)
                                    : MealPlanCalculator.calculateAmountForMeal(
                                            line.amountPerServing(),
                                            recipe.getBaseServings(),
                                            mealPeople
                                    );

                            ShoppingAggregation agg = dayAggregation.computeIfAbsent(line.ingredient().getId(), k ->
                                    new ShoppingAggregation(line.ingredient()));
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

                        // Эффективная цена на дату дня: из кэша (O(1)), без обращения к БД.
                        Optional<IngredientPrice> plannedPriceOpt = effectivePriceFromCache(
                                ingredientId, dayDate, basePrices, priceSeries);

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
                            dayHasMissingPrices = true;
                        }

                        if (actualUnitPrice != null) {
                            actualCost = agg.totalAmount().multiply(actualUnitPrice).setScale(2, RoundingMode.HALF_UP);
                            dayActualCost = dayActualCost.add(actualCost);
                        }

                        PackCalculation packs = calculatePacks(agg.ingredient(), agg.totalAmount());

                        dayItems.add(new ShoppingItemResponse(
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
                                packs.packSize(),
                                packs.packsToBuy(),
                                packs.buyAmount(),
                                packs.leftoverAmount(),
                                agg.substitutedFromName
                        ));
                    }

                    return new DayShoppingResponse(
                            day.getDayDate().toString(),
                            dayItems,
                            MealPlanCalculator.roundToRub(dayPlannedCost),   // Фаза 14: итоги — целые рубли
                            MealPlanCalculator.roundToRub(dayActualCost),
                            dayHasMissingPrices
                    );
                })
                .toList();

        return new SummaryService.ShoppingComputation(shoppingList, byDays, totalPersonMeals, totalCalories);
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
        /** Фаза 14: имя продукта, замещённого пер-походной правкой (для колонки substitutedFrom). */
        private String substitutedFromName;

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

    /**
     * FIX (P1, аудит Phase 11): расчёт упаковок для позиций списка покупок.
     * Раньше packSize/packsToBuy/buyAmount/leftoverAmount были захардкожены в null,
     * и UI не мог показать «сколько пачек покупать».
     *
     * Правила (совпадают с mockServer.ts CONTRACT-P1):
     *  - packSize берётся из Ingredient.packSize (размер упаковки в единицах измерения продукта);
     *  - packsToBuy считается только при roundToPacks=true и валидном packSize (>0),
     *    иначе все поля остаютcя null — UI показывает вес/объём вместо штук;
     *  - buyAmount = packsToBuy * packSize (что реально класть в корзину);
     *  - leftoverAmount = buyAmount - totalAmount (излишек).
     */
    private record PackCalculation(BigDecimal packSize, Integer packsToBuy,
                                   BigDecimal buyAmount, BigDecimal leftoverAmount) {}

    private PackCalculation calculatePacks(Ingredient ingredient, BigDecimal totalAmount) {
        BigDecimal packSize = ingredient.getPackSize();
        if (packSize == null || packSize.compareTo(BigDecimal.ZERO) <= 0) {
            return new PackCalculation(packSize, null, null, null);
        }
        if (!Boolean.TRUE.equals(ingredient.getRoundToPacks())) {
            return new PackCalculation(packSize, null, null, null);
        }
        int packsToBuy = totalAmount.divide(packSize, 0, RoundingMode.CEILING).intValue();
        BigDecimal buyAmount = packSize.multiply(BigDecimal.valueOf(packsToBuy))
                .setScale(3, RoundingMode.HALF_UP);
        BigDecimal leftover = buyAmount.subtract(totalAmount).setScale(3, RoundingMode.HALF_UP);
        return new PackCalculation(packSize, packsToBuy, buyAmount, leftover);
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
