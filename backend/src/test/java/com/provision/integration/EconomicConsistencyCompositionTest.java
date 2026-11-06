package com.provision.integration;

import java.util.List;

import static com.provision.integration.EconomicConsistencySupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.http.MediaType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EconomicConsistencyCompositionTest extends EconomicConsistencyTestBase {

    // ==================== ЭКРАН: СОСТАВ ПРИЁМА (Модалка B) ====================

    @Test
    @DisplayName("EK-05 Состав Д3: SCALED 1.2, SUBST обнуляет источник, EXTRA-абсолют, totals=день")
    void compositionScreen() throws Exception {
        createFixtures();
        var c = getComposition(mealD3R1Id);

        assertThat(c.people()).isEqualTo(4);
        assertThat(c.baseServings()).isEqualTo(2);
        assertThat(c.recipeName()).isEqualTo("ЭК Каша гречневая");

        var grechka = c.byName("ЭК Гречка");
        assertThat(grechka.state()).isEqualTo("SCALED");
        assertThat(grechka.ratio()).isEqualByComparingTo("1.5");
        assertThat(grechka.baseAmountPerServing()).isEqualByComparingTo("0.4");
        assertThat(grechka.derivedAmount()).isEqualByComparingTo("1.200");
        assertThat(grechka.effectiveAmount()).isEqualByComparingTo("1.200");

        // SUBST: строка-источник ОБНУЛЕНА (иначе двойной счёт в totals и в UI).
        var tush = c.byName("ЭК Тушёнка");
        assertThat(tush.effectiveAmount()).isEqualByComparingTo("0");

        var sol = c.byName("ЭК Соль");
        assertThat(sol.state()).isEqualTo("EXCLUDED");
        assertThat(sol.effectiveAmount()).isEqualByComparingTo("0");

        // EXTRA 0.3 (абсолют) + перенос SUBST 4×0.1 = 0.7; цель привязана к походу (snapshot id).
        var sgush = c.byName("ЭК Сгущёнка");
        assertThat(sgush.state()).isEqualTo("EXTRA");
        assertThat(sgush.effectiveAmount()).isEqualByComparingTo("0.700");
        assertThat(sgush.substitutedFrom()).isEqualTo("ЭК Тушёнка");
        assertThat(sgush.ingredientId()).as("EXTRA/SUBST-цель — trip-снепшот, не глобальный id")
                .isEqualTo(snapshotOf(sgushId));

        assertThat(c.substitutions()).hasSize(1);
        var sub = c.substitutions().get(0);
        assertThat(sub.fromName()).isEqualTo("ЭК Тушёнка");
        assertThat(sub.toName()).isEqualTo("ЭК Сгущёнка");
        assertThat(sub.ratio()).isEqualByComparingTo("0.1");

        // totals состава == закупка дня Д3 (330.00); вес и ккал — точные.
        assertThat(c.totalsPlannedCost()).isEqualByComparingTo("330.00");
        assertThat(c.totalsWeightGrams()).isEqualByComparingTo("1900.0");
        assertThat(c.totalsKcal()).isEqualByComparingTo("6356.0");

        // PUT идемпотентен: повтор того же тела не меняет ответ.
        putComposition(mealD3R1Id, List.of(
                itemDto(grechka.ingredientId(), "SCALED", null, "1.5"),
                itemDto(tush.ingredientId(), "RECIPE", null, null),
                itemDto(sol.ingredientId(), "EXCLUDED", null, null),
                itemDto(sgush.ingredientId(), "EXTRA", "0.3", null)
        ), List.of(subDto(tush.ingredientId(), sgush.ingredientId(), "0.1")));
        var c2 = getComposition(mealD3R1Id);
        assertThat(c2.byName("ЭК Сгущёнка").effectiveAmount()).isEqualByComparingTo("0.700");
        assertThat(c2.totalsPlannedCost()).isEqualByComparingTo("330.00");
    }

    // ==================== РЕДАКТИРОВАНИЕ ПРИЁМА (updateMeal) ====================

    @Test
    @DisplayName("EK-08 updateMeal: приём остаётся на trip-снепшоте, правки состава живут, числа пересчитаны")
    void updateMealKeepsSnapshot() throws Exception {
        createFixtures();

        // UI-редактирование приёма шлёт recipeId из пикера (ГЛОБАЛЬНЫЙ id) и новый peopleOverride.
        var res = mockMvc.perform(put("/api/v1/trips/" + tripId + "/days/" + day3Id + "/meals/" + mealD3R1Id)
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mealType\":\"BREAKFAST\",\"recipeId\":" + r1Id + ",\"peopleOverride\":5}"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(lng(objectMapper.readTree(body(res)), "recipeId", true))
                .as("приём указывает на trip-снепшот рецепта, а не на глобальный каталог")
                .isEqualTo(recipeSnapshotId(r1Id));

        var bad = jdbc.queryForObject(
                "SELECT count(*) FROM trip_meals tm JOIN recipes r ON r.id = tm.recipe_id "
                        + "WHERE tm.id = ? AND (r.trip_id IS NULL OR r.snapshot_of IS NULL)",
                Integer.class, mealD3R1Id);
        assertThat(bad).as("после updateMeal блюдо не отвязалось от снепшота").isZero();

        // Люди 5: Гр 0.4/2×5×1.5=1.5; Тш 2/2×5=5 → SUBST 0.5; Сг = EXTRA 0.3 + 0.5 = 0.8.
        var c = getComposition(mealD3R1Id);
        assertThat(c.people()).isEqualTo(5);
        assertThat(c.byName("ЭК Гречка").effectiveAmount()).isEqualByComparingTo("1.500");
        assertThat(c.byName("ЭК Сгущёнка").effectiveAmount()).isEqualByComparingTo("0.800");
        assertThat(c.totalsPlannedCost()).isEqualByComparingTo("390.00"); // 1.5×100 + 0.8×300

        var list = parseShopping(objectMapper, getTrip("/summary/shopping"));
        assertThat(list.amount("ЭК Гречка")).isEqualByComparingTo("6.000");  // 3.0+1.5+1.5
        assertThat(list.amount("ЭК Сгущёнка")).isEqualByComparingTo("2.100"); // 1.3+0.8
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("1470");     // 600+630+40+200
        assertThat(parsePerson(objectMapper, getTrip("/summary/person")).totalPersonMeals()).isEqualTo(25);
    }

}
