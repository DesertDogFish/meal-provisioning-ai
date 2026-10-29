package com.provision.service;

import com.provision.entity.Ingredient;
import com.provision.entity.Recipe;
import com.provision.entity.RecipeIngredient;
import com.provision.entity.Trip;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Подзадачи 11/22 (план plans/2026-10-29-full-audit.md): unit-тесты TripScopedIdResolver —
 * граничные случаи V20-резолва (null, строка рецепта, глобальный id со снепшотом,
 * свой/чужой trip-scope, отсутствующий id) и кэш resolveIngredient.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("TripScopedIdResolver (V20 trip-scope резолв)")
class TripScopedIdResolverTest {

    @Mock
    private IngredientRepository ingredientRepository;
    @Mock
    private TripCatalogSnapshotService snapshotService;
    @InjectMocks
    private TripScopedIdResolver resolver;

    private Trip trip;
    private MealContext ctx;
    private Ingredient snapshotInRecipe; // id=10, снепшот глобального 100
    private Ingredient plainInRecipe;    // id=11

    @BeforeEach
    void setUp() {
        trip = new Trip();
        trip.setId(1L);
        snapshotInRecipe = new Ingredient();
        snapshotInRecipe.setId(10L);
        snapshotInRecipe.setSnapshotOf(100L);
        plainInRecipe = new Ingredient();
        plainInRecipe.setId(11L);
        Recipe recipe = new Recipe();
        recipe.setId(2L);
        recipe.setIngredients(List.of(
                RecipeIngredient.builder().ingredient(snapshotInRecipe).build(),
                RecipeIngredient.builder().ingredient(plainInRecipe).build()));
        ctx = new MealContext(trip, null, null, recipe, 4);
    }

    private Ingredient ing(long id, Long tripId) {
        Ingredient i = new Ingredient();
        i.setId(id);
        i.setTripId(tripId);
        return i;
    }

    @Test
    @DisplayName("null id → IllegalArgumentException (400)")
    void nullIdRejected() {
        assertThatThrownBy(() -> resolver.resolveTripScopedId(ctx, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ingredientId is required");
        verifyNoInteractions(ingredientRepository, snapshotService);
    }

    @Test
    @DisplayName("id строки состава рецепта (уже trip-scoped) → как есть, без запросов")
    void recipeLineIdPassesThrough() {
        assertThat(resolver.resolveTripScopedId(ctx, 11L)).isEqualTo(11L);
        verifyNoInteractions(ingredientRepository, snapshotService);
    }

    @Test
    @DisplayName("ГЛОБАЛЬНЫЙ id, чей снепшот есть в рецепте → id снепшота, без запросов")
    void globalIdWithSnapshotMapsToSnapshot() {
        assertThat(resolver.resolveTripScopedId(ctx, 100L)).isEqualTo(10L);
        verifyNoInteractions(ingredientRepository, snapshotService);
    }

    @Test
    @DisplayName("продукт ЭТОГО похода (tripId совпал) → как есть, снепшот не создаётся")
    void sameTripProductPassesThrough() {
        when(ingredientRepository.findById(20L)).thenReturn(Optional.of(ing(20L, 1L)));
        assertThat(resolver.resolveTripScopedId(ctx, 20L)).isEqualTo(20L);
        verify(snapshotService, never()).snapshotIngredient(any(), any());
    }

    @Test
    @DisplayName("trip-scoped продукт ЧУЖОГО похода → NotFoundException (isolation V20)")
    void foreignTripProductNotFound() {
        when(ingredientRepository.findById(30L)).thenReturn(Optional.of(ing(30L, 999L)));
        assertThatThrownBy(() -> resolver.resolveTripScopedId(ctx, 30L))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("Ingredient not found: 30");
        verify(snapshotService, never()).snapshotIngredient(any(), any());
    }

    @Test
    @DisplayName("несуществующий id → NotFoundException")
    void missingIdNotFound() {
        when(ingredientRepository.findById(404L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> resolver.resolveTripScopedId(ctx, 404L))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    @DisplayName("глобальный продукт (tripId=null) → снепшот-копия через TripCatalogSnapshotService")
    void globalProductGetsSnapshotCopy() {
        Ingredient global = ing(50L, null);
        when(ingredientRepository.findById(50L)).thenReturn(Optional.of(global));
        when(snapshotService.snapshotIngredient(trip, global)).thenReturn(ing(51L, 1L));
        assertThat(resolver.resolveTripScopedId(ctx, 50L)).isEqualTo(51L);
        verify(snapshotService).snapshotIngredient(trip, global);
    }

    @Test
    @DisplayName("resolveIngredient: кэш → без запроса; промах → точечный запрос + кэш; не найден → null без кэша")
    void resolveIngredientCaches() {
        Map<Long, Ingredient> cache = new HashMap<>();
        cache.put(11L, plainInRecipe);
        assertThat(resolver.resolveIngredient(11L, cache)).isSameAs(plainInRecipe);
        verifyNoInteractions(ingredientRepository);

        Ingredient loaded = ing(60L, 1L);
        when(ingredientRepository.findById(60L)).thenReturn(Optional.of(loaded));
        assertThat(resolver.resolveIngredient(60L, cache)).isSameAs(loaded);
        assertThat(cache).containsEntry(60L, loaded);

        when(ingredientRepository.findById(70L)).thenReturn(Optional.empty());
        assertThat(resolver.resolveIngredient(70L, cache)).isNull();
        assertThat(cache).doesNotContainKey(70L);
    }
}
