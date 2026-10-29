package com.provision.service;

import com.provision.dto.summary.MenuByDayResponse;
import com.provision.entity.Ingredient;
import com.provision.entity.MealType;
import com.provision.entity.Recipe;
import com.provision.entity.RecipeIngredient;
import com.provision.entity.Trip;
import com.provision.entity.TripDay;
import com.provision.entity.TripMeal;
import com.provision.entity.UnitOfMeasure;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Подзадача 12 (план plans/done/2026-10-29-full-audit.md): DailySummaryCalculator —
 * меню по дням (effectivePeople override-цепочка, масштабирование количеств).
 */
@DisplayName("DailySummaryCalculator (меню по дням)")
class DailySummaryCalculatorTest {

    private final DailySummaryCalculator calculator = new DailySummaryCalculator();

    private Ingredient ing(long id, String name) {
        Ingredient i = new Ingredient();
        i.setId(id);
        i.setName(name);
        i.setUnit(UnitOfMeasure.KG);
        return i;
    }

    private TripMeal meal(MealType type, Integer peopleOverride, Recipe recipe) {
        TripMeal m = new TripMeal();
        m.setMealType(type);
        m.setPeopleOverride(peopleOverride);
        m.setRecipe(recipe);
        return m;
    }

    private Recipe recipe(long id, String name, int baseServings, Ingredient ing, String amount) {
        Recipe r = new Recipe();
        r.setId(id);
        r.setName(name);
        r.setBaseServings(baseServings);
        r.setIngredients(List.of(RecipeIngredient.builder()
                .ingredient(ing).amount(new BigDecimal(amount)).build()));
        return r;
    }

    @Test
    @DisplayName("день → effectivePeople (override дня → default), блюдо → override блюда; amount = base/baseServings×people (scale 3)")
    void menuByDaysScalesAmounts() {
        Trip trip = new Trip();
        trip.setId(1L);
        trip.setDefaultPeople(4);

        Recipe r = recipe(10L, "Каша", 4, ing(100L, "Гречневая крупа"), "0.4");
        TripMeal breakfast = meal(MealType.BREAKFAST, 2, r);   // override блюда = 2
        TripMeal dinner = meal(MealType.DINNER, null, r);      // default похода = 4

        TripDay day = new TripDay();
        day.setDayDate(LocalDate.of(2026, 5, 1));
        day.setMeals(new LinkedHashSet<>(List.of(breakfast, dinner)));
        trip.setDays(new LinkedHashSet<>(List.of(day)));

        List<MenuByDayResponse> menu = calculator.menuByDays(trip);

        assertThat(menu).hasSize(1);
        MenuByDayResponse d = menu.get(0);
        assertThat(d.dayDate()).isEqualTo("2026-05-01");
        assertThat(d.effectivePeople()).isEqualTo(4); // calculateEffectivePeople(trip, day, null)
        assertThat(d.meals()).hasSize(2);

        assertThat(d.meals().get(0).servings()).isEqualTo(2);
        // 0.4 / 4 порций × 2 чел = 0.200
        assertThat(d.meals().get(0).ingredients().get(0).amount()).isEqualByComparingTo("0.200");
        assertThat(d.meals().get(0).ingredients().get(0).name()).isEqualTo("Гречневая крупа");

        assertThat(d.meals().get(1).servings()).isEqualTo(4);
        // 0.4 / 4 × 4 = 0.400
        assertThat(d.meals().get(1).ingredients().get(0).amount()).isEqualByComparingTo("0.400");
    }

    @Test
    @DisplayName("override дня применяется к блюду без своего override")
    void dayOverrideApplies() {
        Trip trip = new Trip();
        trip.setId(1L);
        trip.setDefaultPeople(4);
        Recipe r = recipe(10L, "Суп", 2, ing(101L, "Тушёнка"), "0.3");
        TripMeal lunch = meal(MealType.LUNCH, null, r);
        TripDay day = new TripDay();
        day.setDayDate(LocalDate.of(2026, 5, 2));
        day.setPeopleOverride(6);
        day.setMeals(new LinkedHashSet<>(List.of(lunch)));
        trip.setDays(new LinkedHashSet<>(List.of(day)));

        MenuByDayResponse d = calculator.menuByDays(trip).get(0);
        assertThat(d.effectivePeople()).isEqualTo(6);
        assertThat(d.meals().get(0).servings()).isEqualTo(6);
        // 0.3 / 2 × 6 = 0.900
        assertThat(d.meals().get(0).ingredients().get(0).amount()).isEqualByComparingTo("0.900");
    }
}
