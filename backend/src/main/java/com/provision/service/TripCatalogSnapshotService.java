package com.provision.service;

import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.entity.Recipe;
import com.provision.entity.RecipeIngredient;
import com.provision.entity.Trip;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.IngredientRepository;
import com.provision.repository.RecipeIngredientRepository;
import com.provision.repository.RecipeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * V20 (изолированные снепшоты каталога): copy-on-write копирование рецептов и продуктов
 * в контекст похода.
 *
 * Зачем: приёмы пищи похода НЕ должны ссылаться на глобальный справочник — иначе
 * (а) админ не может удалить/заменить продукт или блюдо, «занятое» чужим походом,
 * (б) правки справочника и цен ретроспективно меняют уже спланированные походы.
 *
 * Механика (легковесная, без дублирующих таблиц): у recipes/ingredients появились
 * trip_id (NULL = глобальный справочник) и snapshot_of (ссылка на оригинал).
 * При добавлении приёма пищи TripService вызывает {@link #snapshotRecipeForTrip}:
 * рецепт копируется один раз на поход, вместе с ним копируются задействованные продукты
 * (по одному разу на поход) и одна актуальная строка цены на продукт-копию —
 * плановая стоимость похода тем самым замораживается на момент планирования.
 * Расчётное ядро (SummaryService) не меняется: оно ходит по тем же таблицам и ценам.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TripCatalogSnapshotService {

    private final RecipeRepository recipeRepository;
    private final IngredientRepository ingredientRepository;
    private final IngredientPriceRepository priceRepository;
    private final RecipeIngredientRepository recipeIngredientRepository;

    /** Копия рецепта для похода (существующая переиспользуется). */
    @Transactional
    public Recipe snapshotRecipeForTrip(Trip trip, Recipe global) {
        if (global.getTripId() != null) {
            // уже trip-scoped (повторный вызов) — используем как есть
            return global;
        }
        return recipeRepository.findByTripIdAndSnapshotOf(trip.getId(), global.getId())
                .orElseGet(() -> createRecipeCopy(trip, global));
    }

    /** Копия продукта для похода + замороженная плановая цена (существующая переиспользуется). */
    @Transactional
    public Ingredient snapshotIngredient(Trip trip, Ingredient global) {
        if (global.getTripId() != null) {
            return global;
        }
        return ingredientRepository.findByTripIdAndSnapshotOf(trip.getId(), global.getId())
                .orElseGet(() -> createIngredientCopy(trip, global));
    }

    private Recipe createRecipeCopy(Trip trip, Recipe global) {
        Recipe full = recipeRepository.findByIdWithIngredients(global.getId());
        if (full == null) {
            full = global;
        }
        List<RecipeIngredient> sourceRows = full.getIngredients() != null
                ? new ArrayList<>(full.getIngredients())
                : List.of();

        Map<Long, Ingredient> ingredientCopies = new HashMap<>();
        for (RecipeIngredient ri : sourceRows) {
            Ingredient ing = ri.getIngredient();
            ingredientCopies.computeIfAbsent(ing.getId(), id -> createIngredientCopy(trip, ing));
        }

        Recipe copy = Recipe.builder()
                .name(full.getName())
                .mealType(full.getMealType())
                .category(full.getCategory())
                .cookMinutes(full.getCookMinutes())
                .baseServings(full.getBaseServings())
                .caloriesPerServing(full.getCaloriesPerServing())
                .source(full.getSource())
                .tripId(trip.getId())
                .snapshotOf(full.getId())
                .ingredients(new ArrayList<>())
                .build();
        copy = recipeRepository.save(copy);

        for (RecipeIngredient ri : sourceRows) {
            Ingredient ingCopy = ingredientCopies.get(ri.getIngredient().getId());
            recipeIngredientRepository.save(RecipeIngredient.builder()
                    .recipe(copy)
                    .ingredient(ingCopy)
                    .amount(ri.getAmount())
                    .build());
        }
        log.info("Snapshot: recipe '{}' copied for trip {}", full.getName(), trip.getId());
        return copy;
    }

    private Ingredient createIngredientCopy(Trip trip, Ingredient global) {
        Ingredient copy = Ingredient.builder()
                .name(global.getName())
                .nameNorm(global.getNameNorm())
                .unit(global.getUnit())
                .category(global.getCategory())
                .kcalPer100g(global.getKcalPer100g())
                .pieceWeightG(global.getPieceWeightG())
                .packSize(global.getPackSize())
                .roundToPacks(global.getRoundToPacks())
                .tripId(trip.getId())
                .snapshotOf(global.getId())
                .build();
        final Ingredient saved = ingredientRepository.save(copy);

        // Заморозка плановой цены: актуальный срез на момент снепшота.
        // Расчётное ядро продолжает читать ingredient_prices без изменений.
        priceRepository.findEffectivePrice(global.getId(), LocalDate.now()).ifPresent(p ->
                priceRepository.save(IngredientPrice.builder()
                        .ingredient(saved)
                        .pricePerUnit(p.getPricePerUnit())
                        .currency(p.getCurrency())
                        .effectiveFrom(p.getEffectiveFrom())
                        .source(p.getSource())
                        .build()));
        return saved;
    }
}
