package com.provision.service;

import com.provision.entity.Ingredient;
import com.provision.entity.RecipeIngredient;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Подзадачи 11/22 (план plans/done/2026-10-29-full-audit.md): резолвер входящих id
 * в trip-scope похода — отдельный модуль с явной семантикой (V20-привязка).
 *
 * <p>Правила {@link #resolveTripScopedId} (исчерпывающие, по порядку):
 * <ol>
 *   <li>id строки состава рецепта (уже trip-scoped снепшот) — как есть;</li>
 *   <li>ГЛОБАЛЬНЫЙ id продукта, чей trip-снепшот есть в составе рецепта, — id снепшота
 *       (UI может прислать id из справочника для уже присутствующей позиции);</li>
 *   <li>продукт ЭТОГО же похода (например, цель прошлой правки) — как есть;</li>
 *   <li>продукт из глобального справочника — создаём/переиспользуем снепшот-копию
 *       ({@link TripCatalogSnapshotService}: копия + замороженная плановая цена);</li>
 *   <li>чужой trip-scope / несуществующий id / null — ошибка (404 / 400).</li>
 * </ol>
 *
 * <p>Без этого правки состава, закупка и цены работали бы в разных пространствах id
 * (SUBST/EXTRA цели висели на глобальном каталоге: цены не заморожены, один продукт
 * двоится в закупке, isolation V20 дырявится).
 */
@Component
@RequiredArgsConstructor
class TripScopedIdResolver {

    private final IngredientRepository ingredientRepository;
    private final TripCatalogSnapshotService snapshotService;

    /** Входящий ingredientId → id в trip-scope похода ctx (см. правила в javadoc класса). */
    Long resolveTripScopedId(MealContext ctx, Long id) {
        if (id == null) {
            throw new IllegalArgumentException("ingredientId is required");
        }
        for (RecipeIngredient ri : ctx.recipe().getIngredients()) {
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
        if (ctx.trip().getId().equals(loaded.getTripId())) {
            return loaded.getId();
        }
        if (loaded.getTripId() != null) {
            // trip-scoped продукт ЧУЖОГО похода — в этом походе его не существует
            throw new NotFoundException("Ingredient not found: " + id);
        }
        return snapshotService.snapshotIngredient(ctx.trip(), loaded).getId();
    }

    /** Ингредиент из кэша состава/правок; при промахе — один точечный запрос (EXTRA-копия). */
    Ingredient resolveIngredient(Long id, Map<Long, Ingredient> cache) {
        Ingredient cached = cache.get(id);
        if (cached != null) return cached;
        Ingredient loaded = ingredientRepository.findById(id).orElse(null);
        if (loaded != null) cache.put(id, loaded);
        return loaded;
    }
}
