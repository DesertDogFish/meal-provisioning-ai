package com.provision.service;

import com.provision.entity.*;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

/**
 * Фаза 14 (N3): пер-походные правки состава блюд, применяемые к агрегации
 * закупки. Правки хранятся в trip_ingredient_substitutions и НЕ трогают
 * исходный рецепт в каталоге.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TripIngredientEditService {

    private final TripIngredientSubstitutionRepository substitutionRepository;
    private final TripShoppingExclusionRepository exclusionRepository;

    /** Все активные правки похода (замещения/добавления/удаления). */
    public List<TripIngredientSubstitution> getEdits(Long tripId) {
        return substitutionRepository.findAllEditsForTrip(tripId);
    }

    /** Мягкие исключения продуктов из расчёта закупки похода. */
    public Set<Long> getExcludedIngredientIds(Long tripId) {
        Set<Long> out = new HashSet<>();
        for (TripShoppingExclusion e : exclusionRepository.findByTripId(tripId)) {
            out.add(e.getIngredient().getId());
        }
        return out;
    }

    /**
     * Разворачивает список ингредиентов рецепта с учётом правок похода:
     *  - removed (to=null): позиция помечается удалённой (исключается из суммы);
     *  - замена from→to: количество переносится на 'to' × ratio, у источника — zero;
     *  - added (from=null): новая позиция; amountPerServing хранит АБСОЛЮТ на приём
     *    (FORM-meal-composition-spec §3, EXTRA) — такие строки помечаются absolute=true
     *    и НЕ масштабируются людьми/baseServings в SummaryService.
     * Возвращает плоский список строк для последующей агрегации.
     */
    public List<EffectiveLine> applyEdits(Long tripId, Recipe recipe, List<RecipeIngredient> baseLines,
                                          Map<Long, TripIngredientSubstitution> editsByFrom,
                                          List<TripIngredientSubstitution> addedLines) {
        List<EffectiveLine> result = new ArrayList<>();
        for (RecipeIngredient ri : baseLines) {
            Ingredient ing = ri.getIngredient();
            TripIngredientSubstitution edit = editsByFrom.get(ing.getId());
            if (edit == null) {
                result.add(new EffectiveLine(ing, ri.getAmount(), null, false));
            } else if (isScaleInPlace(edit)) {
                // FORM-meal-composition-spec §3: SCALED — правка количества «замена на себя»
                // (from==to): строка остаётся одна, количество умножается на ratio.
                BigDecimal ratio = edit.getRatio() != null ? edit.getRatio() : BigDecimal.ONE;
                result.add(new EffectiveLine(ing, ri.getAmount().multiply(ratio), ing.getName(), false));
            } else if (edit.isRemoved() || edit.getToIngredient() == null) {
                // мягкое удаление: позиция остаётся видимой (для UI), но с нулевой суммой не участвует
                result.add(new EffectiveLine(ing, BigDecimal.ZERO, ing.getName(), false));
            } else {
                // замена from→to: источник обнуляем, приёмник добавляем строкой ниже
                result.add(new EffectiveLine(ing, BigDecimal.ZERO, ing.getName(), false));
                BigDecimal ratio = edit.getRatio() != null ? edit.getRatio() : BigDecimal.ONE;
                result.add(new EffectiveLine(edit.getToIngredient(),
                        ri.getAmount().multiply(ratio), ing.getName(), false));
            }
        }
        for (TripIngredientSubstitution a : addedLines) {
            if (a.getToIngredient() != null && a.getAmountPerServing() != null) {
                // EXTRA: в amount_per_serving лежит абсолют на приём (V21) — без people/base-скейлинга.
                result.add(new EffectiveLine(a.getToIngredient(), a.getAmountPerServing(), null, true));
            }
        }
        return result;
    }

    /**
     * FORM-meal-composition-spec §3: SCALED — «замена на себя» (from==to, не added/removed):
     * правка количества рецептурной строки через ratio, новой строки в составе нет.
     */
    private static boolean isScaleInPlace(TripIngredientSubstitution edit) {
        return !edit.isAdded() && !edit.isRemoved()
                && edit.getFromIngredient() != null && edit.getToIngredient() != null
                && edit.getToIngredient().getId().equals(edit.getFromIngredient().getId());
    }

    /** Группировка правок по типу для конкретного рецепта. */
    public TripEditBundle bundleForTrip(Long tripId) {
        Map<Long, Map<Long, TripIngredientSubstitution>> byRecipeFrom = new HashMap<>();
        Map<Long, List<TripIngredientSubstitution>> byRecipeAdded = new HashMap<>();
        for (TripIngredientSubstitution s : substitutionRepository.findAllEditsForTrip(tripId)) {
            Long recipeId = s.getRecipe().getId();
            if (s.isAdded() || s.getFromIngredient() == null) {
                byRecipeAdded.computeIfAbsent(recipeId, k -> new ArrayList<>()).add(s);
            } else {
                byRecipeFrom.computeIfAbsent(recipeId, k -> new HashMap<>())
                        .put(s.getFromIngredient().getId(), s);
            }
        }
        return new TripEditBundle(byRecipeFrom, byRecipeAdded);
    }

    public record TripEditBundle(
            Map<Long, Map<Long, TripIngredientSubstitution>> substitutionsByRecipeAndFrom,
            Map<Long, List<TripIngredientSubstitution>> addedByRecipe
    ) {
        public Map<Long, TripIngredientSubstitution> subsFor(Long recipeId) {
            return substitutionsByRecipeAndFrom.getOrDefault(recipeId, Map.of());
        }
        public List<TripIngredientSubstitution> addedFor(Long recipeId) {
            return addedByRecipe.getOrDefault(recipeId, List.of());
        }
    }

    /**
     * Итоговая строка состава после применения правок.
     * absolute=true — amountPerServing хранит АБСОЛЮТ на приём (EXTRA, V21-семантика):
     * строка не умножается на people и не делится на baseServings.
     */
    public record EffectiveLine(Ingredient ingredient, BigDecimal amountPerServing,
                                String substitutedFromName, boolean absolute) {}
}
