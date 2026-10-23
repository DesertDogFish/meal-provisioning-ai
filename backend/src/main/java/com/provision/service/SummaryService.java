package com.provision.service;

import com.provision.dto.summary.*;
import com.provision.entity.*;
import com.provision.repository.*;
import jakarta.persistence.EntityManager;
import org.hibernate.engine.internal.BatchFetchQueue;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.metamodel.mapping.EntityMappingType;
import org.hibernate.proxy.HibernateProxy;
import org.hibernate.proxy.LazyInitializer;
import org.hibernate.SessionFactory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

@Service
@Slf4j
@Transactional(readOnly = true)
public class SummaryService {

    private final TripRepository tripRepository;
    private final IngredientPriceRepository priceRepository;
    private final RecipeRepository recipeRepository;
    private final PriceResolutionService priceResolutionService;
    private final TripIngredientSubstitutionRepository substitutionRepository;
    private final TripIngredientEditService tripIngredientEditService; // Фаза 14 (N3)
    private final EntityManager entityManager; // FIX N+1: пакетная инициализация LAZY-проксей category

    public SummaryService(TripRepository tripRepository,
                          IngredientPriceRepository priceRepository,
                          RecipeRepository recipeRepository,
                          PriceResolutionService priceResolutionService,
                          TripIngredientSubstitutionRepository substitutionRepository,
                          TripIngredientEditService tripIngredientEditService) {
        this(tripRepository, priceRepository, recipeRepository, priceResolutionService,
                substitutionRepository, tripIngredientEditService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SummaryService(TripRepository tripRepository,
                          IngredientPriceRepository priceRepository,
                          RecipeRepository recipeRepository,
                          PriceResolutionService priceResolutionService,
                          TripIngredientSubstitutionRepository substitutionRepository,
                          TripIngredientEditService tripIngredientEditService,
                          EntityManager entityManager) {
        this.tripRepository = tripRepository;
        this.priceRepository = priceRepository;
        this.recipeRepository = recipeRepository;
        this.priceResolutionService = priceResolutionService;
        this.substitutionRepository = substitutionRepository;
        this.tripIngredientEditService = tripIngredientEditService;
        this.entityManager = entityManager;
    }

    /**
     * FIX (скрытый N+1 «Initializing proxy: [Ingredient#...]» + отдельный
     * «select ... from ingredients where id=?» на каждый ингредиент):
     * ingredient.category — LAZY @ManyToOne. В расчёте закупки категория не нужна,
     * но любое обращение к прокси Hibernate инициирует её по одному запросу.
     * Здесь все distinct-прокси категорий регистрируются в BatchFetchQueue сессии
     * и инициируются батчем: Hibernate группирует id до
     * hibernate.default_batch_fetch_size («where category_id in (?, ?, ...)») —
     * один запрос вместо K (числа уникальных категорий). Если EntityManager недоступен
     * (unit-тесты с моками) или прокси нет — no-op.
     */
    private void initializeCategoryProxies(java.util.Collection<Recipe> recipes) {
        if (recipes == null || recipes.isEmpty() || entityManager == null) {
            return;
        }
        Set<Object> proxies = new LinkedHashSet<>();
        for (Recipe r : recipes) {
            if (r == null || r.getIngredients() == null) {
                continue;
            }
            for (RecipeIngredient ri : r.getIngredients()) {
                Ingredient ing = ri != null ? ri.getIngredient() : null;
                Object cat = ing != null ? ing.getCategory() : null;
                if (cat instanceof HibernateProxy hp
                        && hp.getHibernateLazyInitializer().isUninitialized()) {
                    proxies.add(hp);
                }
            }
        }
        if (proxies.isEmpty()) {
            return;
        }
        try {
            SharedSessionContractImplementor spi =
                    entityManager.unwrap(org.hibernate.Session.class).getSession();
            BatchFetchQueue queue = spi.getBatchFetchQueue();
            for (Object proxyObj : proxies) {
                LazyInitializer li = ((HibernateProxy) proxyObj).getHibernateLazyInitializer();
                li.setSession(spi);
                queue.addBatchEntityToQueue(BatchFetchQueue.ObjectKey.EntityKey.of(
                        li.getPersistentClass().getName(), li.getIdentifier()));
            }
            // Первый initialize() вытаскивает из очереди батч id (до batch-size) одним
            // запросом «in (...)»; остальные прокси резолвятся из уже загруженного пула.
            for (Object proxyObj : proxies) {
                ((HibernateProxy) proxyObj).getHibernateLazyInitializer().initialize();
            }
        } catch (RuntimeException | Error e) {
            // Не критично: fallback — обычная ленивая инициализация по одному запросу.
            log.debug("Batch category proxy init skipped: {}", e.getMessage());
        }
    }

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

    /**
     * Всё, что нужно для любой агрегации похода: загруженные одним пакетом
     * (JOIN FETCH) составы рецептов и правки состава похода.
     * FIX P1: при open-in-view:false ленивые recipe.ingredients / ri.ingredient
     * иначе грузились по одному запросу на блюдо/ингредиент (классическое N+1),
     * а self-invocation getShoppingList из getPersonSummary обходил прокси
     * @Transactional. Теперь вся загрузка — в одном транзакционном методе.
     */
    private record TripCalculationContext(Map<Long, Recipe> recipesById,
                                          TripIngredientEditService.TripEditBundle edits) {}

    /**
     * Пакетно подменяет рецепты блюд похода на варианты с загруженным составом
     * (ingredients + ingredient). Дедупликация Hibernate по id гарантирует: тот же
     * managed-экземплярRecipe получает заполненную коллекцию, поэтому ссылки
     * meal.getRecipe() продолжают работать без дополнительных запросов.
     */
    private void ensureIngredientsLoaded(Trip trip, Map<Long, Recipe> recipesById) {
        for (TripDay day : trip.getDays()) {
            for (TripMeal meal : day.getMeals()) {
                Recipe r = meal.getRecipe();
                if (r != null) {
                    Recipe hydrated = recipesById.get(r.getId());
                    if (hydrated != null) {
                        meal.setRecipe(hydrated);
                    }
                }
            }
        }
    }

    private TripCalculationContext loadCalculationContext(Trip trip) {
        Set<Long> recipeIds = new HashSet<>();
        for (TripDay day : trip.getDays()) {
            for (TripMeal meal : day.getMeals()) {
                if (meal.getRecipe() != null) {
                    recipeIds.add(meal.getRecipe().getId());
                }
            }
        }
        // ОДИН batch-запрос со fetch-join вместо N+1 по составу рецептов.
        Map<Long, Recipe> recipesById = new HashMap<>();
        if (!recipeIds.isEmpty()) {
            for (Recipe r : recipeRepository.findAllWithIngredientsByIds(recipeIds)) {
                recipesById.putIfAbsent(r.getId(), r);
            }
        }
        // Фолбэк для unit-тестов и любых ситуаций, когда batch-репозиторий не вернул
        // рецепт: оставляем в контексте уже готовые (гидратированные) объекты из графа
        // trips, чтобы расчёт не потерял состав. В проде Hibernate возвращает те же
        // managed-экземпляры, поэтому putIfAbsent ниже их не перетирает.
        for (TripDay day : trip.getDays()) {
            for (TripMeal meal : day.getMeals()) {
                Recipe r = meal.getRecipe();
                if (r != null && r.getId() != null) {
                    recipesById.putIfAbsent(r.getId(), r);
                }
            }
        }
        ensureIngredientsLoaded(trip, recipesById);
        // FIX (скрытый N+1): пакетная инициализация LAZY-проксей ingredient.category
        // одним батч-запросом вместо «select ... where id=?» на каждую категорию.
        initializeCategoryProxies(recipesById.values());
        TripIngredientEditService.TripEditBundle edits =
                tripIngredientEditService.bundleForTrip(trip.getId());
        return new TripCalculationContext(recipesById, edits);
    }

    /** Результат полной агрегации закупки — переиспользуется между эндпоинтами. */
    private record ShoppingComputation(ShoppingListResponse shoppingList,
                                       List<DayShoppingResponse> byDays,
                                       int totalPersonMeals,
                                       BigDecimal totalCalories) {}

    /**
     * FIX P1: единственный метод, который читает БД и считает закупку похода целиком
     * (общий список + по дням + калории/приёмы). Помечен @Transactional явно, чтобы
     * весь обход графа (trip→days→meals→recipe→ingredients→ingredient, цены, правки)
     * выполнялся внутри одной транзакции даже при вызовах через this (self-invocation):
     * публичные эндпоинт-методы теперь только делегируют сюда, не вызывая друг друга.
     */
    @Transactional(readOnly = true)
    public ShoppingComputation computeShopping(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));

        TripCalculationContext ctx = loadCalculationContext(trip);
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
                int mealPeople = calculateEffectivePeople(trip, day, meal);
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
                    BigDecimal mealAmount = calculateAmountForMeal(
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
                roundToRub(totalPlannedCost),
                roundToRub(totalActualCost),
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
                        int mealPeople = calculateEffectivePeople(trip, day, meal);
                        Recipe recipe = meal.getRecipe();

                        // Тот же per-trip edits-bundle, что и в общей закупке (один раз на расчёт)
                        List<TripIngredientEditService.EffectiveLine> lines = tripIngredientEditService.applyEdits(
                                tripId, recipe, recipe.getIngredients(),
                                edits.subsFor(recipe.getId()), edits.addedFor(recipe.getId()));

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
                            roundToRub(dayPlannedCost),   // Фаза 14: итоги — целые рубли
                            roundToRub(dayActualCost),
                            dayHasMissingPrices
                    );
                })
                .toList();

        return new ShoppingComputation(shoppingList, byDays, totalPersonMeals, totalCalories);
    }

    public List<MenuByDayResponse> getMenuByDays(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));

        // FIX P1: состав рецептов и правки состава — одним batch-запросом каждый
        // (см. loadCalculationContext); раньше recipe.ingredients грузился лениво
        // по одному запросу на блюдо/ингредиент (N+1 при open-in-view:false).
        loadCalculationContext(trip);

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
     * FIX P1: эндпоинт только делегирует в единый транзакционный расчёт —
     * никаких повторных обходов графа и вызовов getShoppingList изнутри других
     * методов (self-invocation обходил прокси @Transactional).
     */
    public ShoppingListResponse getShoppingList(Long tripId, Long userId) {
        return computeShopping(tripId, userId).shoppingList();
    }

    public List<DayShoppingResponse> getShoppingByDays(Long tripId, Long userId) {
        return computeShopping(tripId, userId).byDays();
    }

    public PersonSummaryResponse getPersonSummary(Long tripId, Long userId) {
        // Принадлежность похода и доступность defaultPeople — из того же графа,
        // что и раньше; сам расчёт закупки не повторяется (см. computeShopping ниже).
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));
        // FIX P1: состав рецептов подгружается ОДНИМ batch-запросом (JOIN FETCH),
        // иначе ленивые recipe.ingredients/ri.ingredient грузятся по запросу на
        // блюдо/ингредиент прямо здесь (N+1 при open-in-view:false).
        loadCalculationContext(trip);

        // FIX P1: переиспользуем ОДИН результат закупки вместо повторного вызова
        // getShoppingList (двойная агрегация + self-invocation, обходивший прокси
        // @Transactional). totalPersonMeals/totalCalories считаются там же за один обход.
        ShoppingComputation computation = computeShopping(tripId, userId);
        ShoppingListResponse shoppingList = computation.shoppingList();
        final int finalTotalPersonMeals = computation.totalPersonMeals();
        final BigDecimal finalTotalCalories = computation.totalCalories();

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
