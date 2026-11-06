package com.provision.integration;


import static com.provision.integration.EconomicConsistencySupport.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EconomicConsistencyIntegrityTest extends EconomicConsistencyTestBase {

    // ==================== СВЯЗИ В БАЗЕ (INTEGRITY) ====================

    @Test
    @DisplayName("EK-09 Integrity: все сущности похода привязаны к его trip-scoped каталогу")
    void databaseIntegrity() throws Exception {
        createFixtures();
        setOverride(grechkaId, "120.00"); // чек через глобальный id → обязан лечь на снепшот

        // 1. Каждое блюдо похода ссылается на trip-снепшот рецепта со snapshot_of.
        assertZero(
                "приёмы пищи вне trip-снепшотов рецепта",
                "SELECT count(*) FROM trip_meals tm "
                        + "JOIN trip_days td ON td.id = tm.trip_day_id "
                        + "JOIN recipes r ON r.id = tm.recipe_id "
                        + "WHERE td.trip_id = ? AND (r.trip_id IS DISTINCT FROM ? OR r.snapshot_of IS NULL)",
                tripId, tripId);

        // 2. Составы trip-рецептов ссылаются только на trip-продукты того же похода.
        assertZero(
                "строки составов вне trip-снепшотов продуктов",
                "SELECT count(*) FROM recipe_ingredients ri "
                        + "JOIN recipes r ON r.id = ri.recipe_id "
                        + "JOIN ingredients i ON i.id = ri.ingredient_id "
                        + "WHERE r.trip_id = ? AND i.trip_id IS DISTINCT FROM ?",
                tripId, tripId);

        // 3. Правки состава (SCALE/SUBST/EXTRA/EXCLUDE) — только trip-scoped сущности.
        assertZero(
                "правки состава, не привязанные к trip-каталогу похода",
                "SELECT count(*) FROM trip_ingredient_substitutions s "
                        + "WHERE s.trip_id = ? AND ("
                        + " (s.recipe_id IS NOT NULL AND (SELECT trip_id FROM recipes WHERE id = s.recipe_id) IS DISTINCT FROM ?)"
                        + " OR (s.from_ingredient_id IS NOT NULL AND (SELECT trip_id FROM ingredients WHERE id = s.from_ingredient_id) IS DISTINCT FROM ?)"
                        + " OR (s.to_ingredient_id IS NOT NULL AND (SELECT trip_id FROM ingredients WHERE id = s.to_ingredient_id) IS DISTINCT FROM ?))",
                tripId, tripId, tripId, tripId);

        // 4. Чеки (оверрайды) — на trip-продуктах похода (включая ввод через глобальный id).
        assertZero(
                "оверрайды, не привязанные к trip-каталогу похода",
                "SELECT count(*) FROM trip_price_overrides o "
                        + "WHERE o.trip_id = ? AND (SELECT trip_id FROM ingredients WHERE id = o.ingredient_id) IS DISTINCT FROM ?",
                tripId, tripId);

        // 5. Никакого «undefined»/пустоты в trip-каталоге: имя и категория обязательны.
        assertZero(
                "trip-продукты без имени/категории",
                "SELECT count(*) FROM ingredients WHERE trip_id = ? "
                        + "AND (name IS NULL OR btrim(name) = '' OR lower(name) IN ('undefined','null','unknown') "
                        + "     OR category_id IS NULL OR unit IS NULL)",
                tripId);
        assertZero(
                "trip-рецепты без имени/типа",
                "SELECT count(*) FROM recipes WHERE trip_id = ? "
                        + "AND (name IS NULL OR btrim(name) = '' OR lower(name) IN ('undefined','null') "
                        + "     OR meal_type IS NULL OR base_servings IS NULL OR base_servings <= 0)",
                tripId);

        // 6. У каждого trip-продукта, участвующего в меню, есть цена, видимая в окне похода
        //    (effective_from ≤ startDate) — иначе plannedCost=null и «чушь» в итогах.
        assertZero(
                "trip-продукты без цены, видимой на даты похода",
                "SELECT count(DISTINCT i.id) FROM ingredients i "
                        + "JOIN recipe_ingredients ri ON ri.ingredient_id = i.id "
                        + "JOIN recipes r ON r.id = ri.recipe_id "
                        + "WHERE i.trip_id = ? AND NOT EXISTS ("
                        + "  SELECT 1 FROM ingredient_prices p WHERE p.ingredient_id = i.id AND p.effective_from <= ?)",
                tripId, java.sql.Date.valueOf(START));

        // 7. Снепшот-связка полная: у каждой trip-копии есть snapshot_of и оригинал.
        assertZero(
                "trip-копии без snapshot_of",
                "SELECT count(*) FROM ingredients WHERE trip_id = ? AND snapshot_of IS NULL",
                tripId);
    }

}
