package com.provision.service;

import com.provision.dto.trip.MealCompositionDtos.CompositionPutRequest;
import com.provision.dto.trip.MealCompositionDtos.CompositionResponse;
import com.provision.dto.trip.MealCompositionDtos.CompositionResponse.Item;
import com.provision.dto.trip.MealCompositionDtos.CompositionResponse.Substitution;
import com.provision.dto.trip.MealCompositionDtos.CompositionResponse.Totals;
import com.provision.entity.*;
import com.provision.exception.NotFoundException;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * FORM-meal-composition-spec §3/§4: состав конкретного приёма пищи.
 *
 * Хранение (поверх существующей схемы V19/V20/V21, без новых таблиц):
 *  - RECIPE  — рецептурная строка без правки; derived = amount/baseServings × people;
 *  - SCALED  — правка количества: TripIngredientSubstitution(from=X, to=X, ratio) —
 *              «замена на себя» хранится как ratio-корректировка; derived × ratio;
 *  - EXTRA   — добавленный руками продукт: TripIngredientSubstitution(added=true,
 *              from=null, to=X, amountPerServing). По спеке §3 EXTRA — АБСОЛЮТ НА ПРИЁМ:
 *              в amount_per_serving хранится абсолют (V21), SummaryService не масштабирует
 *              такие строки людьми/baseServings (EffectiveLine.absolute);
 *  - EXCLUDED— мягкое исключение: TripIngredientSubstitution(to=null, removed=true);
 *  - замена  — TripIngredientSubstitution(from=A, to=B, ratio), A≠B: qty(B)+=qty(A)×ratio,
 *              qty(A):=0; SCALE-правки with-продуктов переносятся на B вместе с количеством.
 *
 * V20-привязка: ВСЕ id входящего PUT (items/substitutions) резолвятся в trip-scope
 * (resolveTripScopedId): строка рецепта → её снепшот; глобальный продукт из справочника →
 * snowshot-копия с замороженной ценой. Благодаря этому правки состава, закупка и цены
 * работают в едином пространстве id похода (иначе SUBST/EXTRA цели висели на глобальном
 * каталоге: цены не заморожены, один продукт двоится в закупке, isolation V20 дырявится).
 *
 * Порядок применения зафиксирован в спеке §3: SCALE → people → EXCLUDE → EXTRA → substitutions.
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class MealCompositionService {

    public static final String STATE_RECIPE = "RECIPE";
    public static final String STATE_SCALED = "SCALED";
    public static final String STATE_EXTRA = "EXTRA";
    public static final String STATE_EXCLUDED = "EXCLUDED";

    private final TripRepository tripRepository;
    private final RecipeRepository recipeRepository;
    private final IngredientRepository ingredientRepository;
    private final TripIngredientSubstitutionRepository substitutionRepository;
    private final UserRepository userRepository;
    private final PriceResolutionService priceResolutionService;
    private final SummaryService summaryService;
    private final TripCatalogSnapshotService snapshotService;

    /** GET /trips/{t}/meals/{m}/composition — сервер считает ВСЁ масштабирование. */
    @Transactional(readOnly = true)
    public CompositionResponse getComposition(Long tripId, Long mealId, Long userId) {
        MealContext ctx = loadContext(tripId, mealId, userId);
        return buildResponse(ctx);
    }

    /**
     * PUT /trips/{t}/meals/{m}/composition — атомарный диф-коммит модалки B:
     * сервер сравнивает желаемое состояние с текущими правками блюда, удаляет/создаёт/
     * обновляет записи в ОДНОЙ транзакции; ответ = новый GET composition.
     * Повтор того же тела идемпотентен (ничего не меняется).
     */
    @Transactional
    public CompositionResponse putComposition(Long tripId, Long mealId,
                                              CompositionPutRequest request, Long userId) {
        validate(request);
        MealContext ctx = loadContext(tripId, mealId, userId);

        // Дубли ingredientId → 400 (по сырым id запроса)
        Set<Long> seen = new HashSet<>();
        for (CompositionPutRequest.ItemDto item : request.items()) {
            if (!seen.add(item.ingredientId())) {
                throw new IllegalArgumentException("Duplicate ingredientId in items: " + item.ingredientId());
            }
        }

        // V20-привязка: резолвим ВСЕ входящие id в trip-scope (строка рецепта/её снепшот;
        // глобальный продукт из справочника → снепшот-копия с замороженной ценой).
        Set<Long> wantedIds = new LinkedHashSet<>(seen);
        if (request.substitutions() != null) {
            for (CompositionPutRequest.SubstitutionDto s : request.substitutions()) {
                wantedIds.add(s.fromIngredientId());
                wantedIds.add(s.toIngredientId());
            }
        }
        Map<Long, Long> resolved = new LinkedHashMap<>();
        for (Long id : wantedIds) {
            resolved.put(id, resolveTripScopedId(ctx, id));
        }

        // Проверки дублей/самозамен — ПОСЛЕ резолва (два разных глобальных id могут
        // отображаться в один снепшот; SUBST «на себя» после снепшота — та же позиция).
        Set<Long> resolvedSeen = new HashSet<>();
        for (CompositionPutRequest.ItemDto item : request.items()) {
            if (!resolvedSeen.add(resolved.get(item.ingredientId()))) {
                throw new IllegalArgumentException("Duplicate ingredientId in items: " + item.ingredientId());
            }
        }
        Set<Long> subSeen = new HashSet<>();
        if (request.substitutions() != null) {
            for (CompositionPutRequest.SubstitutionDto s : request.substitutions()) {
                Long from = resolved.get(s.fromIngredientId());
                Long to = resolved.get(s.toIngredientId());
                if (from.equals(to)) {
                    throw new IllegalArgumentException("From and to ingredients must be different");
                }
                if (!subSeen.add(from)) {
                    throw new IllegalArgumentException("Duplicate substitution from: " + s.fromIngredientId());
                }
            }
        }

        Map<Long, Ingredient> ingredients = new HashMap<>();
        ingredientRepository.findAllById(resolved.values()).forEach(i -> ingredients.put(i.getId(), i));
        for (Long id : resolved.values()) {
            if (!ingredients.containsKey(id)) {
                throw new NotFoundException("Ingredient not found: " + id);
            }
        }

        List<TripIngredientSubstitution> current =
                substitutionRepository.findByTripIdAndRecipeId(tripId, ctx.recipe.getId());
        Map<Long, TripIngredientSubstitution> scaleByFrom = new HashMap<>();
        Map<Long, TripIngredientSubstitution> extraByTo = new HashMap<>();
        Map<Long, TripIngredientSubstitution> excludeByFrom = new HashMap<>();
        Map<Long, TripIngredientSubstitution> replaceByFrom = new HashMap<>();
        for (TripIngredientSubstitution s : current) {
            if (s.isAdded() || s.getFromIngredient() == null) {
                if (s.getToIngredient() != null) extraByTo.put(s.getToIngredient().getId(), s);
            } else if (s.isRemoved() || s.getToIngredient() == null) {
                excludeByFrom.put(s.getFromIngredient().getId(), s);
            } else if (s.getToIngredient().getId().equals(s.getFromIngredient().getId())) {
                scaleByFrom.put(s.getFromIngredient().getId(), s);
            } else {
                replaceByFrom.put(s.getFromIngredient().getId(), s);
            }
        }

        User user = userRepository.findById(userId).orElse(null);

        // --- diff по items ---
        Set<Long> keepScaled = new HashSet<>();
        Set<Long> keepExtra = new HashSet<>();
        Set<Long> keepExcluded = new HashSet<>();
        for (CompositionPutRequest.ItemDto item : request.items()) {
            Long ingId = resolved.get(item.ingredientId());
            switch (item.state()) {
                case STATE_SCALED -> {
                    keepScaled.add(ingId);
                    TripIngredientSubstitution existing = scaleByFrom.get(ingId);
                    Ingredient ing = ingredients.get(ingId);
                    if (existing == null) {
                        substitutionRepository.save(TripIngredientSubstitution.builder()
                                .trip(ctx.trip).recipe(ctx.recipe)
                                .fromIngredient(ing).toIngredient(ing)
                                .ratio(item.ratio()).comment("SCALE via composition")
                                .createdBy(user).build());
                    } else if (existing.getRatio().compareTo(item.ratio()) != 0) {
                        existing.setRatio(item.ratio());
                        substitutionRepository.save(existing);
                    }
                    // SCALED поверх EXCLUDED — снимаем исключение
                    TripIngredientSubstitution ex = excludeByFrom.get(ingId);
                    if (ex != null) {
                        substitutionRepository.delete(ex);
                        excludeByFrom.remove(ingId);
                    }
                }
                case STATE_EXTRA -> {
                    keepExtra.add(ingId);
                    // §3/V21: EXTRA — АБСОЛЮТ на приём; amount_per_serving added-строки хранит
                    // его напрямую (SummaryService не масштабирует такие строки — см.
                    // EffectiveLine.absolute; GET composition отдаёт значение как есть).
                    // Старая схема (abs/people) теряла точность при baseServings≠1 и давала
                    // вклад abs/base в закупке — расчёт расходился с составом.
                    BigDecimal absolute = item.amount();
                    TripIngredientSubstitution existing = extraByTo.get(ingId);
                    if (existing == null) {
                        substitutionRepository.save(TripIngredientSubstitution.builder()
                                .trip(ctx.trip).recipe(ctx.recipe)
                                .fromIngredient(null).toIngredient(ingredients.get(ingId))
                                .amountPerServing(absolute).ratio(BigDecimal.ONE)
                                .added(true).removed(false)
                                .comment("EXTRA via composition")
                                .createdBy(user).build());
                    } else if (existing.getAmountPerServing() == null
                            || existing.getAmountPerServing().compareTo(absolute) != 0) {
                        existing.setAmountPerServing(absolute);
                        substitutionRepository.save(existing);
                    }
                }
                case STATE_EXCLUDED -> {
                    keepExcluded.add(ingId);
                    if (!excludeByFrom.containsKey(ingId)) {
                        Ingredient ing = ingredients.get(ingId);
                        substitutionRepository.save(TripIngredientSubstitution.builder()
                                .trip(ctx.trip).recipe(ctx.recipe)
                                .fromIngredient(ing).toIngredient(null)
                                .ratio(BigDecimal.ONE).removed(true)
                                .comment("EXCLUDE via composition")
                                .createdBy(user).build());
                    }
                }
                default -> { /* RECIPE — правок нет */ }
            }
        }

        // Убираем правки, которых нет в desired-состоянии (state=RECIPE или позиция исчезла)
        for (Map.Entry<Long, TripIngredientSubstitution> e : scaleByFrom.entrySet()) {
            if (!keepScaled.contains(e.getKey())) substitutionRepository.delete(e.getValue());
        }
        for (Map.Entry<Long, TripIngredientSubstitution> e : extraByTo.entrySet()) {
            if (!keepExtra.contains(e.getKey())) substitutionRepository.delete(e.getValue());
        }
        for (Map.Entry<Long, TripIngredientSubstitution> e : excludeByFrom.entrySet()) {
            if (!keepExcluded.contains(e.getKey())) substitutionRepository.delete(e.getValue());
        }

        // --- diff по substitutions (полная замена набора) ---
        List<CompositionPutRequest.SubstitutionDto> wantSubs =
                request.substitutions() == null ? List.of() : request.substitutions();
        Map<Long, TripIngredientSubstitution> keepReplace = new HashMap<>();
        for (CompositionPutRequest.SubstitutionDto dto : wantSubs) {
            Long fromId = resolved.get(dto.fromIngredientId());
            Long toId = resolved.get(dto.toIngredientId());
            TripIngredientSubstitution existing = replaceByFrom.get(fromId);
            boolean changed = existing == null
                    || !existing.getToIngredient().getId().equals(toId)
                    || nvl(existing.getRatio()).compareTo(nvl(dto.ratio())) != 0;
            if (changed) {
                if (existing != null) substitutionRepository.delete(existing);
                substitutionRepository.save(TripIngredientSubstitution.builder()
                        .trip(ctx.trip).recipe(ctx.recipe)
                        .fromIngredient(ingredients.get(fromId))
                        .toIngredient(ingredients.get(toId))
                        .ratio(nvl(dto.ratio())).comment("SUBST via composition")
                        .createdBy(user).build());
            }
            if (existing != null) keepReplace.put(fromId, existing);
        }
        for (Map.Entry<Long, TripIngredientSubstitution> e : replaceByFrom.entrySet()) {
            if (!keepReplace.containsKey(e.getKey())) substitutionRepository.delete(e.getValue());
        }

        substitutionRepository.flush();
        log.info("Composition commit: trip {} meal {} items {} subs {}", tripId, mealId,
                request.items().size(), wantSubs.size());

        // Ответ = свежий GET (пересобрать контекст после изменений набора правок)
        return buildResponse(loadContext(tripId, mealId, userId));
    }

    // ================= расчёт состава =================

    private record MealContext(Trip trip, TripDay day, TripMeal meal, Recipe recipe, int people) {}

    private MealContext loadContext(Long tripId, Long mealId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));
        TripDay foundDay = null;
        TripMeal foundMeal = null;
        for (TripDay d : trip.getDays()) {
            for (TripMeal m : d.getMeals()) {
                if (m.getId().equals(mealId)) {
                    foundDay = d;
                    foundMeal = m;
                }
            }
        }
        if (foundMeal == null) {
            throw new NotFoundException("Meal not found in trip");
        }
        List<Recipe> hydrated = recipeRepository.findAllWithIngredientsByIds(
                List.of(foundMeal.getRecipe().getId()));
        if (hydrated.isEmpty()) {
            throw new NotFoundException("Recipe not found");
        }
        Recipe recipe = hydrated.get(0);
        int people = summaryService.calculateEffectivePeople(trip, foundDay, foundMeal);
        return new MealContext(trip, foundDay, foundMeal, recipe, people);
    }

    /**
     * V20-привязка входящего ingredientId к trip-scope похода:
     *  1) id строки состава рецепта (уже trip-scoped) — как есть;
     *  2) ГЛОБАЛЬНЫЙ id продукта, чей trip-снепшот есть в составе рецепта, — id снепшота
     *     (UI может прислать id из справочника для уже присутствующей позиции);
     *  3) продукт этого же похода (например, цель прошлой правки) — как есть;
     *  4) продукт из глобального справочника — создаём/переиспользуем снепшот-копию
     *     (TripCatalogSnapshotService: копия + замороженная плановая цена);
     *  5) чужой trip-scope / несуществующий id — 404.
     */
    private Long resolveTripScopedId(MealContext ctx, Long id) {
        if (id == null) {
            throw new IllegalArgumentException("ingredientId is required");
        }
        for (RecipeIngredient ri : ctx.recipe.getIngredients()) {
            Ingredient ing = ri.getIngredient();
            if (ing.getId().equals(id)) {
                return ing.getId();
            }
            if (id.equals(ing.getSnapshotOf())) {
                return ing.getId();
            }
        }
        Ingredient loaded = ingredientRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Ingredient not found: " + id));
        if (ctx.trip.getId().equals(loaded.getTripId())) {
            return loaded.getId();
        }
        if (loaded.getTripId() != null) {
            // trip-scoped продукт ЧУЖОГО похода — в этом походе его не существует
            throw new NotFoundException("Ingredient not found: " + id);
        }
        return snapshotService.snapshotIngredient(ctx.trip, loaded).getId();
    }

    private CompositionResponse buildResponse(MealContext ctx) {
        List<TripIngredientSubstitution> edits =
                substitutionRepository.findByTripIdAndRecipeId(ctx.trip.getId(), ctx.recipe.getId());

        Map<Long, BigDecimal> scaleRatios = new HashMap<>();
        Map<Long, BigDecimal> extraAmounts = new HashMap<>(); // абсолют на приём
        Set<Long> excluded = new HashSet<>();
        Map<Long, TripIngredientSubstitution> replacements = new LinkedHashMap<>();
        for (TripIngredientSubstitution s : edits) {
            if (s.isAdded() || s.getFromIngredient() == null) {
                if (s.getToIngredient() != null && s.getAmountPerServing() != null) {
                    // §3/V21: amount_per_serving added-строки хранит АБСОЛЮТ на приём.
                    extraAmounts.put(s.getToIngredient().getId(), s.getAmountPerServing());
                }
            } else if (s.isRemoved() || s.getToIngredient() == null) {
                excluded.add(s.getFromIngredient().getId());
            } else if (s.getToIngredient().getId().equals(s.getFromIngredient().getId())) {
                scaleRatios.put(s.getFromIngredient().getId(), nvl(s.getRatio()));
            } else {
                replacements.put(s.getFromIngredient().getId(), s);
            }
        }

        int baseServings = ctx.recipe.getBaseServings() != null && ctx.recipe.getBaseServings() > 0
                ? ctx.recipe.getBaseServings() : 1;

        // Кэш ингредиентов состава/правок — нужен уже при построении строк (EXTRA-позиции).
        Map<Long, Ingredient> ingCache = new HashMap<>();
        for (RecipeIngredient ri : ctx.recipe.getIngredients()) {
            ingCache.put(ri.getIngredient().getId(), ri.getIngredient());
        }
        for (TripIngredientSubstitution s : edits) {
            if (s.getFromIngredient() != null) ingCache.putIfAbsent(s.getFromIngredient().getId(), s.getFromIngredient());
            if (s.getToIngredient() != null) ingCache.putIfAbsent(s.getToIngredient().getId(), s.getToIngredient());
        }

        // 1) эффективные количества до замен: SCALE → people → EXCLUDE → EXTRA
        Map<Long, Item> itemsById = new LinkedHashMap<>();
        Map<Long, BigDecimal> effective = new LinkedHashMap<>();
        for (RecipeIngredient ri : ctx.recipe.getIngredients()) {
            Ingredient ing = ri.getIngredient();
            if (excluded.contains(ing.getId())) {
                itemsById.put(ing.getId(), toItem(ing, ri.getAmount(), null, BigDecimal.ZERO,
                        STATE_EXCLUDED, null, null));
                effective.put(ing.getId(), BigDecimal.ZERO);
                continue;
            }
            BigDecimal ratio = scaleRatios.get(ing.getId());
            BigDecimal derived = summaryService.calculateAmountForMeal(
                    ri.getAmount(), baseServings, ctx.people);
            if (ratio != null) {
                derived = derived.multiply(ratio).setScale(3, RoundingMode.HALF_UP);
            }
            itemsById.put(ing.getId(), toItem(ing, ri.getAmount(), derived, derived,
                    ratio != null ? STATE_SCALED : STATE_RECIPE, ratio, null));
            effective.put(ing.getId(), derived);
        }
        for (Map.Entry<Long, BigDecimal> e : extraAmounts.entrySet()) {
            Ingredient ing = resolveIngredient(e.getKey(), ingCache);
            if (ing == null) continue;
            itemsById.put(ing.getId(), toItem(ing, null, null, e.getValue(), STATE_EXTRA, null, null));
            effective.put(ing.getId(), e.getValue());
        }

        // 2) substitutions: qty[to] += qty[from] × ratio; qty[from] := 0
        List<Substitution> subDtos = new ArrayList<>();
        for (TripIngredientSubstitution s : replacements.values()) {
            Long fromId = s.getFromIngredient().getId();
            Long toId = s.getToIngredient().getId();
            BigDecimal qtyFrom = effective.getOrDefault(fromId, BigDecimal.ZERO);
            BigDecimal moved = qtyFrom.multiply(nvl(s.getRatio())).setScale(3, RoundingMode.HALF_UP);
            effective.put(fromId, BigDecimal.ZERO);

            // §3: строка-источник ОБНУЛЯЕТСЯ и в ответе (количество перенесено приёмнику) —
            // иначе totals (ккал/вес/цена) и таблица UI считают заменённый продукт дважды
            // (паритет с mockServer: buildCompositionResponse zeroing, PR #53).
            Item fromItem = itemsById.get(fromId);
            if (fromItem != null) {
                itemsById.put(fromId, new Item(fromItem.ingredientId(), fromItem.name(), fromItem.unit(),
                        fromItem.packSize(), fromItem.pieceWeightG(), fromItem.kcalPer100g(),
                        fromItem.baseAmountPerServing(), fromItem.derivedAmount(), BigDecimal.ZERO,
                        fromItem.state(), fromItem.ratio(), fromItem.substitutedFrom(), fromItem.kcalTotal()));
            }

            Item existingTo = itemsById.get(toId);
            BigDecimal baseTo = existingTo != null && existingTo.effectiveAmount() != null
                    ? existingTo.effectiveAmount() : BigDecimal.ZERO;
            // §3: adjustments исходного from-ингредиента (SCALE/EXTRA) переносятся на to
            // вместе с количеством — state получателя наследует их.
            String newState = existingTo != null ? existingTo.state() : STATE_RECIPE;
            BigDecimal newRatio = existingTo != null ? existingTo.ratio() : null;
            if (existingTo == null || STATE_RECIPE.equals(newState)) {
                String fromState = effective.containsKey(fromId) && itemsById.containsKey(fromId)
                        ? itemsById.get(fromId).state() : STATE_EXTRA;
                if (STATE_SCALED.equals(fromState)) {
                    newState = STATE_SCALED;
                    newRatio = scaleRatios.get(fromId);
                } else if (STATE_EXTRA.equals(fromState)) {
                    newState = STATE_EXTRA;
                }
            }
            Ingredient toIng = ingCache.get(toId);
            if (toIng == null) toIng = s.getToIngredient();
            itemsById.put(toId, toItem(toIng,
                    existingTo != null ? existingTo.baseAmountPerServing() : null,
                    existingTo != null ? existingTo.derivedAmount() : null,
                    baseTo.add(moved), newState, newRatio,
                    s.getFromIngredient().getName()));
            subDtos.add(new Substitution(s.getId(), fromId, s.getFromIngredient().getName(),
                    toId, s.getToIngredient().getName(), nvl(s.getRatio())));
        }

        // 3) totals: ккал, вес (г), план-стоимость по ЦЕНЕ ДНЯ приёма
        BigDecimal kcal = BigDecimal.ZERO;
        BigDecimal weightGrams = BigDecimal.ZERO;
        BigDecimal plannedCost = BigDecimal.ZERO;
        LocalDate date = ctx.day.getDayDate();
        for (Item item : itemsById.values()) {
            BigDecimal qty = item.effectiveAmount() == null ? BigDecimal.ZERO : item.effectiveAmount();
            if (qty.signum() <= 0) continue;
            Ingredient ing = resolveIngredient(item.ingredientId(), ingCache);
            if (ing != null) {
                if (ing.getKcalPer100g() != null) {
                    kcal = kcal.add(kcalOf(qty, ing.getUnit(), ing.getKcalPer100g(),
                            ing.getPieceWeightG()));
                }
                weightGrams = weightGrams.add(weightOfGrams(qty, ing.getUnit(), ing.getPieceWeightG()));
                BigDecimal unitPrice = priceResolutionService
                        .getPlannedPrice(ing.getId(), date).orElse(null);
                if (unitPrice != null) {
                    plannedCost = plannedCost.add(
                            qty.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP));
                }
            }
        }

        List<Item> orderedItems = new ArrayList<>();
        for (Item item : itemsById.values()) {
            BigDecimal qty = item.effectiveAmount() == null ? BigDecimal.ZERO : item.effectiveAmount();
            Ingredient ing = resolveIngredient(item.ingredientId(), ingCache);
            BigDecimal kcalTotal = ing != null && ing.getKcalPer100g() != null && qty.signum() > 0
                    ? kcalOf(qty, ing.getUnit(), ing.getKcalPer100g(), ing.getPieceWeightG())
                            .setScale(1, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            orderedItems.add(withKcal(item, kcalTotal));
        }

        return new CompositionResponse(
                ctx.meal.getId(), ctx.day.getDayDate(), ctx.meal.getMealType(), ctx.people,
                baseServings, ctx.recipe.getId(),
                // Fix-2 (п.7): глобальный id блюда — snapshotOf снепшота или сам id
                ctx.recipe.getSnapshotOf() != null ? ctx.recipe.getSnapshotOf() : ctx.recipe.getId(),
                ctx.recipe.getName(),
                orderedItems, subDtos,
                new Totals(kcal.setScale(1, RoundingMode.HALF_UP),
                        weightGrams.setScale(1, RoundingMode.HALF_UP),
                        plannedCost.setScale(2, RoundingMode.HALF_UP)));
    }

    /** Ингредиент из кэша состава/правок; при промахе — один точечный запрос (EXTRA-копия). */
    private Ingredient resolveIngredient(Long id, Map<Long, Ingredient> cache) {
        Ingredient cached = cache.get(id);
        if (cached != null) return cached;
        Ingredient loaded = ingredientRepository.findById(id).orElse(null);
        if (loaded != null) cache.put(id, loaded);
        return loaded;
    }

    private Item toItem(Ingredient ing, BigDecimal basePerServing, BigDecimal derived,
                        BigDecimal effective, String state, BigDecimal ratio, String substitutedFrom) {
        return new Item(ing.getId(), ing.getName(), ing.getUnit().name(),
                ing.getPackSize(), ing.getPieceWeightG(), ing.getKcalPer100g(),
                basePerServing, derived, effective, state, ratio, substitutedFrom, null);
    }

    private Item withKcal(Item i, BigDecimal kcalTotal) {
        return new Item(i.ingredientId(), i.name(), i.unit(), i.packSize(), i.pieceWeightG(),
                i.kcalPer100g(), i.baseAmountPerServing(), i.derivedAmount(), i.effectiveAmount(),
                i.state(), i.ratio(), i.substitutedFrom(), kcalTotal);
    }

    // ================= математика единиц (эталон ARCHITECTURE/calc.ts) =================

    /** Граммы позиции: KG/L → ×1000; PCS/PACK → qty × piece_weight_g (если известен). */
    static BigDecimal weightOfGrams(BigDecimal qty, UnitOfMeasure unit, BigDecimal pieceWeightG) {
        if (qty == null) return BigDecimal.ZERO;
        if (unit == UnitOfMeasure.KG || unit == UnitOfMeasure.L) {
            return qty.multiply(BigDecimal.valueOf(1000));
        }
        if (pieceWeightG != null && pieceWeightG.signum() > 0) {
            return qty.multiply(pieceWeightG);
        }
        return BigDecimal.ZERO;
    }

    /** Ккал позиции: kcalPer100g × граммы / 100 (без округления — суммируем точно). */
    static BigDecimal kcalOf(BigDecimal qty, UnitOfMeasure unit, BigDecimal kcalPer100g,
                             BigDecimal pieceWeightG) {
        if (kcalPer100g == null) return BigDecimal.ZERO;
        return weightOfGrams(qty, unit, pieceWeightG)
                .multiply(kcalPer100g)
                .divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP);
    }

    private static BigDecimal nvl(BigDecimal v) {
        return v == null ? BigDecimal.ONE : v;
    }

    private void validate(CompositionPutRequest request) {
        if (request.items() == null) {
            throw new IllegalArgumentException("items are required");
        }
        for (CompositionPutRequest.ItemDto item : request.items()) {
            String st = item.state();
            if (st == null) throw new IllegalArgumentException("state is required");
            switch (st) {
                case STATE_RECIPE, STATE_EXCLUDED -> { /* ок */ }
                case STATE_EXTRA -> {
                    if (item.amount() == null || item.amount().signum() <= 0) {
                        throw new IllegalArgumentException("EXTRA requires amount > 0");
                    }
                }
                case STATE_SCALED -> {
                    if (item.ratio() == null || item.ratio().signum() <= 0) {
                        throw new IllegalArgumentException("SCALED requires ratio > 0");
                    }
                }
                default -> throw new IllegalArgumentException("Unknown state: " + st);
            }
        }
        if (request.substitutions() != null) {
            for (CompositionPutRequest.SubstitutionDto s : request.substitutions()) {
                if (s.ratio() != null && s.ratio().signum() <= 0) {
                    throw new IllegalArgumentException("substitution ratio must be > 0");
                }
            }
        }
    }
}
