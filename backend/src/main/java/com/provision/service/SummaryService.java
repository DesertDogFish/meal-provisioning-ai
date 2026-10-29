package com.provision.service;

import com.provision.dto.summary.*;
import com.provision.entity.*;
import com.provision.repository.*;
import jakarta.persistence.EntityManager;
import org.hibernate.Hibernate;
import org.hibernate.proxy.HibernateProxy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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

    /**
     * R3 (Fix-3): ручные позиции закупки (trip_manual_items, V22).
     * Опциональная инъекция: существующие unit-тесты конструируют сервис старыми
     * конструкторами (null-репозитории) — при null ручные позиции просто не
     * участвуют (поведение прежних тестов не меняется).
     */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private TripManualItemRepository manualItemRepository;

    // Подзадача 12: калькуляторы — отдельные модули (см. их javadoc); создаются здесь,
    // чтобы существующие unit-тесты могли конструировать сервис напрямую (new SummaryService(...)).
    private final ShoppingListCalculator shoppingListCalculator;
    private final DailySummaryCalculator dailySummaryCalculator = new DailySummaryCalculator();
    private final PerUserSummaryCalculator perUserSummaryCalculator = new PerUserSummaryCalculator();

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
        this.shoppingListCalculator = new ShoppingListCalculator(
                priceRepository, priceResolutionService, tripIngredientEditService);
    }

    /**
     * FIX (скрытый N+1 «Initializing proxy» + отдельный
     * «select ... from product_categories where id=?» на каждую категорию):
     * ingredient.category — LAZY @ManyToOne. В расчёте закупки категория не нужна,
     * но любое обращение к прокси Hibernate инициирует её по одному запросу.
     * Здесь все distinct-неинициализированные прокси категорий собираются в
     * LinkedHashSet (дедупликация по identity — одна инициализация на прокси) и
     * инициируются через стабильный публичный API org.hibernate.Hibernate#initialize.
     * Сами последовательные инициализации схлопываются в пакетные запросы
     * «where category_id in (?, ...)» настройкой hibernate.default_batch_fetch_size
     * (см. application.yml) — это надёжный механизм вместо внутреннего SPI
     * BatchFetchQueue, который не компилируется на текущей версии Hibernate.
     * Если EntityManager недоступен (unit-тесты с моками) или прокси нет — no-op.
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
            for (Object proxyObj : proxies) {
                Hibernate.initialize(proxyObj);
            }
        } catch (RuntimeException | Error e) {
            // Не критично: fallback — обычная ленивая инициализация по одному запросу.
            log.debug("Batch category proxy init skipped: {}", e.getMessage());
        }
    }


    /** Эффективное число людей приёма: override блюда → override дня → default похода. */
    public int calculateEffectivePeople(Trip trip, TripDay day, TripMeal meal) {
        return MealPlanCalculator.calculateEffectivePeople(trip, day, meal);
    }

    public BigDecimal calculateAmountPerPerson(BigDecimal amount, int baseServings) {
        return MealPlanCalculator.calculateAmountPerPerson(amount, baseServings);
    }

    public BigDecimal calculateAmountForMeal(BigDecimal amount, int baseServings, int people) {
        return MealPlanCalculator.calculateAmountForMeal(amount, baseServings, people);
    }

    public Optional<IngredientPrice> findPriceForDate(Long ingredientId, LocalDate date) {
        return priceRepository.findEffectivePrice(ingredientId, date);
    }


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
    record ShoppingComputation(ShoppingListResponse shoppingList,
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
        return shoppingListCalculator.compute(trip, ctx, tripId, manualItemRepository);
    }

    public List<MenuByDayResponse> getMenuByDays(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));

        // FIX P1: состав рецептов и правки состава — одним batch-запросом каждый
        // (см. loadCalculationContext); раньше recipe.ingredients грузился лениво
        // по одному запросу на блюдо/ингредиент (N+1 при open-in-view:false).
        loadCalculationContext(trip);

        return dailySummaryCalculator.menuByDays(trip);
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
        return perUserSummaryCalculator.summarize(trip, computeShopping(tripId, userId));
    }






}
