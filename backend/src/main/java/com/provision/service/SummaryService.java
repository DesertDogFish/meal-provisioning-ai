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
    private final TripIngredientEditService tripIngredientEditService; // Фаза 14 (N3)

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

    /**
     * Фаза 14 (требование пользователя): все ИТОГОВЫЕ суммы похода округляются до целых
     * рублей; промежуточные цены за единицу и стоимости отдельных позиций остаются в копейках
     * («в расчёте используем нормальную цену»), иначе «На человека» при малых суммах
     * округлялось бы к нулю.
     */
    static BigDecimal roundToRub(BigDecimal value) {
        if (value == null) {
            return null;
        }
        return value.setScale(0, RoundingMode.HALF_UP);
    }

    public Optional<IngredientPrice> findPriceForDate(Long ingredientId, LocalDate date) {
        return priceRepository.findEffectivePrice(ingredientId, date);
    }

    public List<MenuByDayResponse> getMenuByDays(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));

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
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));

        Map<Long, BigDecimal> overrides = priceResolutionService.getAllOverrides(tripId);
        Map<Long, ShoppingAggregation> aggregation = new LinkedHashMap<>();

        // Фаза 14 (N3): пер-походные правки состава (замены/добавления/удаления),
        // применяются ДО агрегации по ингредиентам. Рецепт в каталоге не трогается.
        TripIngredientEditService.TripEditBundle edits = tripIngredientEditService.bundleForTrip(tripId);

        for (TripDay day : trip.getDays()) {
            for (TripMeal meal : day.getMeals()) {
                int mealPeople = calculateEffectivePeople(trip, day, meal);
                Recipe recipe = meal.getRecipe();

                List<TripIngredientEditService.EffectiveLine> lines = tripIngredientEditService.applyEdits(
                        tripId, recipe, recipe.getIngredients(),
                        edits.subsFor(recipe.getId()), edits.addedFor(recipe.getId()));

                for (TripIngredientEditService.EffectiveLine line : lines) {
                    BigDecimal mealAmount = calculateAmountForMeal(
                            line.amountPerServing(),
                            recipe.getBaseServings(),
                            mealPeople
                    );

                    ShoppingAggregation agg = aggregation.computeIfAbsent(line.ingredient().getId(), k ->
                            new ShoppingAggregation(line.ingredient()));
                    agg.addAmount(mealAmount);
                    if (agg.substitutedFromName == null && line.substitutedFromName() != null) {
                        agg.substitutedFromName = line.substitutedFromName();
                    }
                }
            }
        }

        List<ShoppingItemResponse> items = new ArrayList<>();
        BigDecimal totalPlannedCost = BigDecimal.ZERO;
        BigDecimal totalActualCost = BigDecimal.ZERO;
        boolean hasMissingPrices = false;
        List<String> missingIngredients = new ArrayList<>();
        int overriddenCount = 0;

        // FIX P1 (аудит): раньше findEffectivePrice вызывался внутри цикла по каждому
        // ингредиенту — N+1. Теперь плановые цены на дату окончания грузятся одним
        // пакетным запросом DISTINCT ON; оверрайды и так уже в памяти (getAllOverrides).
        Map<Long, IngredientPrice> plannedPricesByIngredient = loadLatestPrices(
                aggregation.keySet(), trip.getEndDate());

        for (ShoppingAggregation agg : aggregation.values()) {
            Long ingredientId = agg.ingredient().getId();
            BigDecimal overridePrice = overrides.get(ingredientId);
            
            // Получаем плановую цену на дату окончания похода (для общей сводки)
            Optional<IngredientPrice> plannedPriceOpt = Optional.ofNullable(
                    plannedPricesByIngredient.get(ingredientId));
            
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

            PackCalculation packs = calculatePacks(agg.ingredient(), agg.totalAmount());

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
                    packs.packSize(),      // FIX (P1): packSize из справочника
                    packs.packsToBuy(),    // FIX (P1): ceil(total/packSize) при roundToPacks
                    packs.buyAmount(),     // FIX (P1): сколько реально покупать
                    packs.leftoverAmount(),// FIX (P1): излишек
                    agg.substitutedFromName   // Фаза 14: имя замещённого продукта (null = без замены)
            ));
        }

        BigDecimal deltaPercent = calculateDeltaPercent(totalPlannedCost, totalActualCost);

        // Фаза 14: итоговые суммы — целые рубли (позиции и цены за единицу остаются точными).
        return new ShoppingListResponse(
                items,
                roundToRub(totalPlannedCost),
                roundToRub(totalActualCost),
                deltaPercent,
                overriddenCount,
                hasMissingPrices,
                missingIngredients
        );
    }

    public List<DayShoppingResponse> getShoppingByDays(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));

        Map<Long, BigDecimal> overrides = priceResolutionService.getAllOverrides(tripId);

        // FIX P1 (аудит): пакетная загрузка цен вместо N+1 внутри цикла по дням.
        // 1) Один запрос DISTINCT ON на всю дату окончания — это нижняя грань:
        //    для любой даты внутри похода эффективная цена либо совпадает, либо старше.
        // 2) Собираем id всех ингредиентов рецептов похода и одним запросом тянем все
        //    их ценовые ряды в память; для дат раньше endDate корректируем эффективную
        //    цену pick'ом из ряда (иначе distinct-on вернул бы цену, ещё не действующую на день).
        Set<Long> allIngredientIds = new HashSet<>();
        for (TripDay day : trip.getDays()) {
            for (TripMeal meal : day.getMeals()) {
                if (meal.getRecipe() != null && meal.getRecipe().getIngredients() != null) {
                    meal.getRecipe().getIngredients().forEach(ri ->
                            allIngredientIds.add(ri.getIngredient().getId()));
                }
            }
        }

        // Фаза 14 (N3): правки состава похода + id замещённых продуктов в ценовой набор
        TripIngredientEditService.TripEditBundle dayEdits = tripIngredientEditService.bundleForTrip(tripId);
        for (Map<Long, TripIngredientSubstitution> subs : dayEdits.substitutionsByRecipeAndFrom().values()) {
            for (TripIngredientSubstitution sub : subs.values()) {
                if (sub.getToIngredient() != null) allIngredientIds.add(sub.getToIngredient().getId());
            }
        }
        for (List<TripIngredientSubstitution> added : dayEdits.addedByRecipe().values()) {
            for (TripIngredientSubstitution a : added) {
                if (a.getToIngredient() != null) allIngredientIds.add(a.getToIngredient().getId());
            }
        }
        LocalDate rangeEnd = trip.getEndDate();
        Map<Long, IngredientPrice> basePrices = loadLatestPrices(allIngredientIds, rangeEnd);
        Map<Long, List<IngredientPrice>> priceSeries = new HashMap<>();
        if (!allIngredientIds.isEmpty()) {
            for (IngredientPrice p : priceRepository.findByIngredientIdInOrderByEffectiveFromDesc(allIngredientIds)) {
                priceSeries.computeIfAbsent(p.getIngredient().getId(), k -> new ArrayList<>()).add(p);
            }
        }

        return trip.getDays().stream()
                .map(day -> {
                    Map<Long, ShoppingAggregation> dayAggregation = new LinkedHashMap<>();
                    BigDecimal dayPlannedCost = BigDecimal.ZERO;
                    BigDecimal dayActualCost = BigDecimal.ZERO;
                    boolean hasMissingPrices = false;

                    LocalDate dayDate = day.getDayDate();

                    for (TripMeal meal : day.getMeals()) {
                        int mealPeople = calculateEffectivePeople(trip, day, meal);
                        Recipe recipe = meal.getRecipe();

                        // Фаза 14 (N3): тот же пер-походный edits-bundle, что и в общей закупке
                        List<TripIngredientEditService.EffectiveLine> lines = tripIngredientEditService.applyEdits(
                                tripId, recipe, recipe.getIngredients(),
                                dayEdits.subsFor(recipe.getId()), dayEdits.addedFor(recipe.getId()));

                        for (TripIngredientEditService.EffectiveLine line : lines) {
                            BigDecimal mealAmount = calculateAmountForMeal(
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

                    List<ShoppingItemResponse> items = new ArrayList<>();
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
                            hasMissingPrices = true;
                        }

                        if (actualUnitPrice != null) {
                            actualCost = agg.totalAmount().multiply(actualUnitPrice).setScale(2, RoundingMode.HALF_UP);
                            dayActualCost = dayActualCost.add(actualCost);
                        }

                        PackCalculation packs = calculatePacks(agg.ingredient(), agg.totalAmount());

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
                                packs.packSize(),      // FIX (P1): packSize из справочника
                                packs.packsToBuy(),    // FIX (P1): ceil(total/packSize) при roundToPacks
                                packs.buyAmount(),     // FIX (P1): сколько реально покупать
                                packs.leftoverAmount(),// FIX (P1): излишек
                                agg.substitutedFromName   // Фаза 14: имя замещённого продукта
                        ));
                    }

                    return new DayShoppingResponse(
                            day.getDayDate().toString(),
                            items,
                            roundToRub(dayPlannedCost),   // Фаза 14: итоги — целые рубли
                            roundToRub(dayActualCost),
                            hasMissingPrices
                    );
                })
                .toList();
    }

    public PersonSummaryResponse getPersonSummary(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));

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

        // Создаём final копии для использования в лямбде
        final int finalTotalPersonMeals = totalPersonMeals;
        final BigDecimal finalTotalCalories = totalCalories;

        List<PersonSummaryResponse.PersonIngredientResponse> ingredients = shoppingList.items().stream()
                .map(item -> {
                    BigDecimal amountPerDefaultPerson = item.totalAmount()
                            .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 3, RoundingMode.HALF_UP);
                    
                    BigDecimal amountPerPersonMeal = finalTotalPersonMeals > 0
                            ? item.totalAmount().divide(BigDecimal.valueOf(finalTotalPersonMeals), 3, RoundingMode.HALF_UP)
                            : BigDecimal.ZERO;
                    
                    BigDecimal plannedCostPerDefaultPerson = item.plannedCost() != null
                            ? item.plannedCost().divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal actualCostPerDefaultPerson = item.actualCost() != null
                            ? item.actualCost().divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal plannedCostPerPersonMeal = item.plannedCost() != null && finalTotalPersonMeals > 0
                            ? item.plannedCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP)
                            : null;
                    
                    BigDecimal actualCostPerPersonMeal = item.actualCost() != null && finalTotalPersonMeals > 0
                            ? item.actualCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP)
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

        // Фаза 14: все ИТОГОВЫЕ суммы — целые рубли; промежуточный расчёт (позиции, цены за ед.)
        // остаётся точным. Деление на людей идёт от точного total до округления.
        BigDecimal plannedCostPerDefaultPerson = roundToRub(shoppingList.totalPlannedCost()
                .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP));

        BigDecimal actualCostPerDefaultPerson = roundToRub(shoppingList.totalActualCost()
                .divide(BigDecimal.valueOf(trip.getDefaultPeople()), 2, RoundingMode.HALF_UP));

        BigDecimal plannedCostPerPersonMeal = finalTotalPersonMeals > 0
                ? roundToRub(shoppingList.totalPlannedCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP))
                : BigDecimal.ZERO;

        BigDecimal actualCostPerPersonMeal = finalTotalPersonMeals > 0
                ? roundToRub(shoppingList.totalActualCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP))
                : BigDecimal.ZERO;
        
        BigDecimal actualCostPerPersonMeal = finalTotalPersonMeals > 0
                ? shoppingList.totalActualCost().divide(BigDecimal.valueOf(finalTotalPersonMeals), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        
        BigDecimal caloriesPerPersonMeal = finalTotalPersonMeals > 0
                ? finalTotalCalories.divide(BigDecimal.valueOf(finalTotalPersonMeals), 0, RoundingMode.HALF_UP)
                : null;

        TripSummaryResponse tripSummary = new TripSummaryResponse(
                shoppingList.totalPlannedCost(),
                shoppingList.totalActualCost(),
                shoppingList.deltaPercent(),
                shoppingList.overriddenCount(),
                shoppingList.hasMissingPrices(),
                shoppingList.missingIngredients(),
                finalTotalPersonMeals,
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
