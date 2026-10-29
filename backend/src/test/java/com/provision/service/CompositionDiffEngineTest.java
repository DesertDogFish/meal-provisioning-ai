package com.provision.service;

import com.provision.dto.trip.MealCompositionDtos.CompositionPutRequest;
import com.provision.dto.trip.MealCompositionDtos.CompositionPutRequest.ItemDto;
import com.provision.dto.trip.MealCompositionDtos.CompositionPutRequest.SubstitutionDto;
import com.provision.entity.Ingredient;
import com.provision.entity.Recipe;
import com.provision.entity.Trip;
import com.provision.entity.TripIngredientSubstitution;
import com.provision.entity.TripMeal;
import com.provision.entity.User;
import com.provision.repository.TripIngredientSubstitutionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Подзадача 11 (план plans/2026-10-29-full-audit.md): unit-тесты CompositionDiffEngine —
 * диф-коммит SCALE/EXTRA/EXCLUDE/SUBST (FORM-meal-composition-spec §3), идемпотентность
 * повтора того же тела, удаление устаревших правок.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("CompositionDiffEngine (диф-коммит правок состава)")
class CompositionDiffEngineTest {

    @Mock
    private TripIngredientSubstitutionRepository substitutionRepository;
    @InjectMocks
    private CompositionDiffEngine engine;

    private Trip trip;
    private Recipe recipe;
    private MealContext ctx;
    private Ingredient a; // id=10
    private Ingredient b; // id=11
    private User user;
    private Map<Long, Long> resolved;
    private Map<Long, Ingredient> ingredients;

    @BeforeEach
    void setUp() {
        trip = new Trip();
        trip.setId(1L);
        recipe = new Recipe();
        recipe.setId(2L);
        recipe.setIngredients(new ArrayList<>());
        TripMeal meal = new TripMeal();
        meal.setId(3L);
        ctx = new MealContext(trip, null, meal, recipe, 4);
        a = new Ingredient();
        a.setId(10L);
        a.setName("A");
        b = new Ingredient();
        b.setId(11L);
        b.setName("B");
        user = new User();
        user.setId(7L);
        resolved = new HashMap<>(Map.of(10L, 10L, 11L, 11L));
        ingredients = new HashMap<>(Map.of(10L, a, 11L, b));
    }

    private void currentSubs(TripIngredientSubstitution... subs) {
        when(substitutionRepository.findByTripIdAndRecipeId(1L, 2L)).thenReturn(List.of(subs));
    }

    private CompositionPutRequest req(List<ItemDto> items, List<SubstitutionDto> subs) {
        return new CompositionPutRequest(items, subs);
    }

    private TripIngredientSubstitution scale(long id, Ingredient ing, String ratio) {
        return TripIngredientSubstitution.builder().id(id).trip(trip).recipe(recipe)
                .fromIngredient(ing).toIngredient(ing).ratio(new BigDecimal(ratio)).build();
    }

    private TripIngredientSubstitution extra(long id, Ingredient ing, String amount) {
        return TripIngredientSubstitution.builder().id(id).trip(trip).recipe(recipe)
                .fromIngredient(null).toIngredient(ing).added(true)
                .amountPerServing(new BigDecimal(amount)).ratio(BigDecimal.ONE).build();
    }

    private TripIngredientSubstitution exclude(long id, Ingredient ing) {
        return TripIngredientSubstitution.builder().id(id).trip(trip).recipe(recipe)
                .fromIngredient(ing).toIngredient(null).removed(true).ratio(BigDecimal.ONE).build();
    }

    private TripIngredientSubstitution replace(long id, Ingredient from, Ingredient to, String ratio) {
        return TripIngredientSubstitution.builder().id(id).trip(trip).recipe(recipe)
                .fromIngredient(from).toIngredient(to).ratio(new BigDecimal(ratio)).build();
    }

    @Test
    @DisplayName("SCALED без существующей правки → save «замены на себя» с ratio и комментарием")
    void scaledCreatesSelfSubstitution() {
        currentSubs();
        engine.applyDiff(ctx, req(List.of(new ItemDto(10L, "SCALED", null, new BigDecimal("1.5"))), null),
                resolved, ingredients, user);
        ArgumentCaptor<TripIngredientSubstitution> captor =
                ArgumentCaptor.forClass(TripIngredientSubstitution.class);
        verify(substitutionRepository).save(captor.capture());
        TripIngredientSubstitution saved = captor.getValue();
        assertThat(saved.getFromIngredient()).isSameAs(a);
        assertThat(saved.getToIngredient()).isSameAs(a);
        assertThat(saved.getRatio()).isEqualByComparingTo("1.5");
        assertThat(saved.getComment()).isEqualTo("SCALE via composition");
        assertThat(saved.getCreatedBy()).isSameAs(user);
        verify(substitutionRepository).flush();
    }

    @Test
    @DisplayName("SCALED идемпотентен: тот же ratio → ничего не сохраняем; другой → обновляем")
    void scaledIdempotentAndUpdates() {
        currentSubs(scale(50L, a, "1.5"));
        engine.applyDiff(ctx, req(List.of(new ItemDto(10L, "SCALED", null, new BigDecimal("1.50"))), null),
                resolved, ingredients, user);
        verify(substitutionRepository, never()).save(any());
        verify(substitutionRepository, never()).delete(any(TripIngredientSubstitution.class));

        engine.applyDiff(ctx, req(List.of(new ItemDto(10L, "SCALED", null, new BigDecimal("2"))), null),
                resolved, ingredients, user);
        ArgumentCaptor<TripIngredientSubstitution> captor =
                ArgumentCaptor.forClass(TripIngredientSubstitution.class);
        verify(substitutionRepository).save(captor.capture());
        assertThat(captor.getValue().getId()).isEqualTo(50L);
        assertThat(captor.getValue().getRatio()).isEqualByComparingTo("2");
    }

    @Test
    @DisplayName("SCALED поверх EXCLUDED → исключение удаляется (§3)")
    void scaledRemovesExclusion() {
        TripIngredientSubstitution ex = exclude(60L, a);
        currentSubs(ex);
        engine.applyDiff(ctx, req(List.of(new ItemDto(10L, "SCALED", null, BigDecimal.ONE)), null),
                resolved, ingredients, user);
        verify(substitutionRepository).delete(ex);
    }

    @Test
    @DisplayName("EXTRA → save c АБСОЛЮТОМ на приём в amountPerServing (V21), added=true, from=null")
    void extraStoresAbsoluteAmount() {
        currentSubs();
        engine.applyDiff(ctx, req(List.of(new ItemDto(11L, "EXTRA", new BigDecimal("2.5"), null)), null),
                resolved, ingredients, user);
        ArgumentCaptor<TripIngredientSubstitution> captor =
                ArgumentCaptor.forClass(TripIngredientSubstitution.class);
        verify(substitutionRepository).save(captor.capture());
        TripIngredientSubstitution saved = captor.getValue();
        assertThat(saved.isAdded()).isTrue();
        assertThat(saved.getFromIngredient()).isNull();
        assertThat(saved.getToIngredient()).isSameAs(b);
        assertThat(saved.getAmountPerServing()).isEqualByComparingTo("2.5");
        assertThat(saved.getComment()).isEqualTo("EXTRA via composition");
    }

    @Test
    @DisplayName("EXCLUDED: новая правка → save removed=true/to=null; повтор → идемпотентно")
    void excludedCreateOnce() {
        currentSubs();
        engine.applyDiff(ctx, req(List.of(new ItemDto(10L, "EXCLUDED", null, null)), null),
                resolved, ingredients, user);
        ArgumentCaptor<TripIngredientSubstitution> captor =
                ArgumentCaptor.forClass(TripIngredientSubstitution.class);
        verify(substitutionRepository).save(captor.capture());
        assertThat(captor.getValue().isRemoved()).isTrue();
        assertThat(captor.getValue().getToIngredient()).isNull();
        assertThat(captor.getValue().getComment()).isEqualTo("EXCLUDE via composition");

        currentSubs(exclude(61L, a));
        engine.applyDiff(ctx, req(List.of(new ItemDto(10L, "EXCLUDED", null, null)), null),
                resolved, ingredients, user);
        verify(substitutionRepository, never()).delete(any(TripIngredientSubstitution.class));
    }

    @Test
    @DisplayName("state=RECIPE → устаревшие SCALE/EXTRA/EXCLUDE правки удаляются")
    void staleEditsDeleted() {
        TripIngredientSubstitution sc = scale(50L, a, "1.5");
        TripIngredientSubstitution ex = extra(51L, b, "2");
        TripIngredientSubstitution exc = exclude(52L, a);
        currentSubs(sc, ex, exc);
        engine.applyDiff(ctx, req(List.of(new ItemDto(10L, "RECIPE", null, null)), null),
                resolved, ingredients, user);
        // sc и exc удалены; exc ещё и в excludeByFrom, но RECIPE не keeps ничего
        verify(substitutionRepository).delete(sc);
        verify(substitutionRepository).delete(ex);
        verify(substitutionRepository).delete(exc);
        verify(substitutionRepository, never()).save(any());
    }

    @Test
    @DisplayName("SUBST: изменение ratio → delete старой + save новой; пустой набор → удаление")
    void substitutionSetReplaced() {
        TripIngredientSubstitution r = replace(70L, a, b, "1");
        currentSubs(r);
        engine.applyDiff(ctx, req(List.of(), List.of(new SubstitutionDto(10L, 11L, new BigDecimal("2")))),
                resolved, ingredients, user);
        verify(substitutionRepository).delete(r);
        ArgumentCaptor<TripIngredientSubstitution> captor =
                ArgumentCaptor.forClass(TripIngredientSubstitution.class);
        verify(substitutionRepository).save(captor.capture());
        TripIngredientSubstitution saved = captor.getValue();
        assertThat(saved.getFromIngredient()).isSameAs(a);
        assertThat(saved.getToIngredient()).isSameAs(b);
        assertThat(saved.getRatio()).isEqualByComparingTo("2");
        assertThat(saved.getComment()).isEqualTo("SUBST via composition");

        currentSubs(r);
        engine.applyDiff(ctx, req(List.of(), null), resolved, ingredients, user);
        verify(substitutionRepository, org.mockito.Mockito.times(2)).delete(r);
    }

    @Test
    @DisplayName("SUBST идемпотентна: тот же to+ratio → ни delete, ни save")
    void substitutionIdempotent() {
        currentSubs(replace(70L, a, b, "1"));
        engine.applyDiff(ctx, req(List.of(), List.of(new SubstitutionDto(10L, 11L, BigDecimal.ONE))),
                resolved, ingredients, user);
        verify(substitutionRepository, never()).save(any());
        verify(substitutionRepository, never()).delete(any(TripIngredientSubstitution.class));
        verify(substitutionRepository).flush();
    }
}
