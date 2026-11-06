package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.test.web.servlet.MvcResult;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class EconomicConsistencySupport {
    private EconomicConsistencySupport() {}

    // ==================== парсеры ответов ====================

    static List<MenuDay> parseMenu(ObjectMapper objectMapper, MvcResult r) throws Exception {
        String raw = body(r);
        JsonNode root = objectMapper.readTree(raw);
        assertThat(root.isArray()).as("/summary/menu — массив дней; тело: %s", truncate(raw)).isTrue();
        List<MenuDay> out = new ArrayList<>();
        for (JsonNode day : root) {
            List<MenuMeal> meals = new ArrayList<>();
            for (JsonNode m : arr(day, "meals", "день меню", raw)) {
                List<MenuIngredient> ings = new ArrayList<>();
                for (JsonNode ing : arr(m, "ingredients", "приём", raw)) {
                    ings.add(new MenuIngredient(text(ing, "name", true), dec(ing, "amount", true),
                            text(ing, "unit", true)));
                }
                meals.add(new MenuMeal(text(m, "mealType", true), text(m, "recipeName", true),
                        intg(m, "servings", true), ings));
            }
            out.add(new MenuDay(text(day, "dayDate", true), intg(day, "effectivePeople", true), meals));
        }
        return out;
    }

    static ShoppingList parseShopping(ObjectMapper objectMapper, MvcResult r) throws Exception {
        String raw = body(r);
        JsonNode root = objectMapper.readTree(raw);
        assertThat(root.isObject()).as("/summary/shopping — объект; тело: %s", truncate(raw)).isTrue();
        List<ShoppingItem> items = new ArrayList<>();
        for (JsonNode it : arr(root, "items", "закупка", raw)) {
            items.add(new ShoppingItem(
                    lng(it, "ingredientId", true),
                    text(it, "ingredientName", true),
                    text(it, "unit", true),
                    dec(it, "totalAmount", true),
                    dec(it, "plannedUnitPrice", false),
                    dec(it, "actualUnitPrice", false),
                    dec(it, "plannedCost", false),
                    dec(it, "actualCost", false),
                    bool(it, "overridden", true),
                    dec(it, "packSize", false),
                    intgOrNull(it, "packsToBuy"),
                    dec(it, "buyAmount", false),
                    dec(it, "leftoverAmount", false)));
        }
        return new ShoppingList(items,
                dec(root, "totalPlannedCost", true),
                dec(root, "totalActualCost", true),
                dec(root, "deltaPercent", false),
                intg(root, "overriddenCount", true),
                bool(root, "hasMissingPrices", true));
    }

    static List<DayShopping> parseDayShopping(ObjectMapper objectMapper, MvcResult r) throws Exception {
        String raw = body(r);
        JsonNode root = objectMapper.readTree(raw);
        assertThat(root.isArray()).as("/summary/shopping/by-days — массив; тело: %s", truncate(raw)).isTrue();
        List<DayShopping> out = new ArrayList<>();
        for (JsonNode day : root) {
            List<ShoppingItem> items = new ArrayList<>();
            for (JsonNode it : arr(day, "items", "день закупки", raw)) {
                items.add(new ShoppingItem(
                        lng(it, "ingredientId", true),
                        text(it, "ingredientName", true),
                        text(it, "unit", true),
                        dec(it, "totalAmount", true),
                        dec(it, "plannedUnitPrice", false),
                        dec(it, "actualUnitPrice", false),
                        dec(it, "plannedCost", false),
                        dec(it, "actualCost", false),
                        bool(it, "overridden", true),
                        dec(it, "packSize", false),
                        intgOrNull(it, "packsToBuy"),
                        dec(it, "buyAmount", false),
                        dec(it, "leftoverAmount", false)));
            }
            out.add(new DayShopping(text(day, "dayDate", true), items,
                    dec(day, "plannedCost", true), dec(day, "actualCost", false)));
        }
        return out;
    }

    static PersonSummary parsePerson(ObjectMapper objectMapper, MvcResult r) throws Exception {
        String raw = body(r);
        JsonNode root = objectMapper.readTree(raw);
        JsonNode trip = root.get("tripSummary");
        assertThat(trip != null && !trip.isNull()).as("/summary/person.tripSummary; тело: %s", truncate(raw)).isTrue();
        List<PersonIngredient> ingredients = new ArrayList<>();
        for (JsonNode pi : arr(root, "ingredients", "person", raw)) {
            ingredients.add(new PersonIngredient(
                    text(pi, "ingredientName", true),
                    text(pi, "unit", true),
                    dec(pi, "amountPerDefaultPerson", true),
                    dec(pi, "amountPerPersonMeal", true),
                    dec(pi, "plannedCostPerDefaultPerson", false),
                    dec(pi, "actualCostPerDefaultPerson", false),
                    dec(pi, "plannedCostPerPersonMeal", false),
                    dec(pi, "actualCostPerPersonMeal", false)));
        }
        return new PersonSummary(ingredients,
                intg(trip, "totalPersonMeals", true),
                dec(trip, "plannedCostPerDefaultPerson", true),
                dec(trip, "actualCostPerDefaultPerson", true),
                dec(trip, "plannedCostPerPersonMeal", true),
                dec(trip, "actualCostPerPersonMeal", true),
                dec(trip, "caloriesPerPersonMeal", false));
    }

    static Composition parseComposition(JsonNode root) {
        List<CompItem> items = new ArrayList<>();
        for (JsonNode it : root.get("items")) {
            items.add(new CompItem(
                    lng(it, "ingredientId", true),
                    text(it, "name", true),
                    text(it, "unit", true),
                    dec(it, "baseAmountPerServing", false),
                    dec(it, "derivedAmount", false),
                    dec(it, "effectiveAmount", true),
                    text(it, "state", true),
                    dec(it, "ratio", false),
                    text(it, "substitutedFrom", false)));
        }
        List<Composition.Sub> subs = new ArrayList<>();
        if (root.has("substitutions") && root.get("substitutions").isArray()) {
            for (JsonNode s : root.get("substitutions")) {
                subs.add(new Composition.Sub(
                        lng(s, "fromIngredientId", true), text(s, "fromName", true),
                        lng(s, "toIngredientId", true), text(s, "toName", true),
                        dec(s, "ratio", false)));
            }
        }
        JsonNode totals = root.get("totals");
        return new Composition(items, subs,
                intg(root, "people", true), intg(root, "baseServings", true),
                text(root, "recipeName", true),
                dec(totals, "kcal", false), dec(totals, "weightGrams", false),
                dec(totals, "plannedCost", false));
    }

    // ==================== модели ответов ====================

    record MenuDay(String dayDate, Integer effectivePeople, List<MenuMeal> meals) {}

    record MenuMeal(String mealType, String recipeName, Integer servings, List<MenuIngredient> ingredients) {
        BigDecimal amount(String name) {
            BigDecimal sum = BigDecimal.ZERO;
            for (MenuIngredient ing : ingredients) {
                if (ing.name().equals(name)) sum = sum.add(ing.amount());
            }
            return sum;
        }
    }

    record MenuIngredient(String name, BigDecimal amount, String unit) {}

    record ShoppingItem(Long ingredientId, String ingredientName, String unit,
                                BigDecimal totalAmount, BigDecimal plannedUnitPrice, BigDecimal actualUnitPrice,
                                BigDecimal plannedCost, BigDecimal actualCost, boolean overridden,
                                BigDecimal packSize, Integer packsToBuy, BigDecimal buyAmount,
                                BigDecimal leftoverAmount) {}

    record ShoppingList(List<ShoppingItem> items, BigDecimal totalPlannedCost, BigDecimal totalActualCost,
                                BigDecimal deltaPercent, Integer overriddenCount, boolean hasMissingPrices) {
        ShoppingItem byName(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name)).findFirst()
                    .orElseThrow(() -> new AssertionError("Позиция '" + name + "' не найдена в закупке: "
                            + items.stream().map(ShoppingItem::ingredientName).toList()));
        }
        BigDecimal amount(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        BigDecimal planned(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::plannedCost).filter(java.util.Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        BigDecimal actual(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::actualCost).filter(java.util.Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        BigDecimal unit(String name, boolean planned) {
            ShoppingItem i = byName(name);
            BigDecimal v = planned ? i.plannedUnitPrice() : i.actualUnitPrice();
            assertThat(v).as("%s: %s unit price присутствует", name, planned ? "плановая" : "фактическая").isNotNull();
            return v;
        }
    }

    record DayShopping(String dayDate, List<ShoppingItem> items,
                               BigDecimal plannedCost, BigDecimal actualCost) {
        BigDecimal amount(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        }
    }

    record PersonIngredient(String ingredientName, String unit,
                                    BigDecimal amountPerDefaultPerson, BigDecimal amountPerPersonMeal,
                                    BigDecimal plannedCostPerDefaultPerson, BigDecimal actualCostPerDefaultPerson,
                                    BigDecimal plannedCostPerPersonMeal, BigDecimal actualCostPerPersonMeal) {}

    record PersonSummary(List<PersonIngredient> ingredients, Integer totalPersonMeals,
                                 BigDecimal plannedCostPerDefaultPerson, BigDecimal actualCostPerDefaultPerson,
                                 BigDecimal plannedCostPerPersonMeal, BigDecimal actualCostPerPersonMeal,
                                 BigDecimal caloriesPerPersonMeal) {
        PersonIngredient byName(String name) {
            return ingredients.stream().filter(i -> i.ingredientName().equals(name)).findFirst()
                    .orElseThrow(() -> new AssertionError("Позиция '" + name + "' не найдена в person.ingredients"));
        }
    }

    record CompItem(Long ingredientId, String name, String unit,
                            BigDecimal baseAmountPerServing, BigDecimal derivedAmount, BigDecimal effectiveAmount,
                            String state, BigDecimal ratio, String substitutedFrom) {}

    record Composition(List<CompItem> items, List<Sub> substitutions,
                               int people, int baseServings, String recipeName,
                               BigDecimal totalsKcal, BigDecimal totalsWeightGrams, BigDecimal totalsPlannedCost) {
        record Sub(Long fromIngredientId, String fromName, Long toIngredientId, String toName, BigDecimal ratio) {}

        CompItem byName(String name) {
            return items.stream().filter(i -> i.name().equals(name)).findFirst()
                    .orElseThrow(() -> new AssertionError("Строка '" + name + "' не найдена в составе: "
                            + items.stream().map(CompItem::name).toList()));
        }
        Long itemId(String name) {
            return items.stream().filter(i -> i.name().equals(name)).map(CompItem::ingredientId)
                    .findFirst().orElse(null);
        }
    }

    // ==================== утилиты ====================

    /** Локальная копия политики округления итогов (SummaryService.roundToRub, Фаза 14). */
    static BigDecimal roundToRub(BigDecimal value) {
        return value == null ? null : value.setScale(0, RoundingMode.HALF_UP);
    }

    static BigDecimal exactSum(List<ShoppingItem> items, boolean planned) {
        BigDecimal s = BigDecimal.ZERO;
        for (ShoppingItem i : items) {
            BigDecimal c = planned ? i.plannedCost() : i.actualCost();
            if (c != null) s = s.add(c);
        }
        return s;
    }

    static String body(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    static String truncate(String s) {
        return s == null ? "null" : (s.length() > 600 ? s.substring(0, 600) + "…" : s);
    }

    static String text(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return null;
        }
        return v.asText();
    }

    /** Long сериализуется в String (Фаза 11) — парсим и число, и строку. */
    static long lng(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return 0L;
        }
        return v.isNumber() ? v.asLong() : Long.parseLong(v.asText().trim());
    }

    static int intg(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return 0;
        }
        return v.isNumber() ? v.asInt() : Integer.parseInt(v.asText().trim());
    }

    static Integer intgOrNull(JsonNode n, String f) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) return null;
        return v.isNumber() ? v.asInt() : Integer.parseInt(v.asText().trim());
    }

    static BigDecimal dec(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return null;
        }
        if (v.isNumber()) return v.decimalValue();
        String s = v.asText().trim();
        if (s.isEmpty()) {
            if (required) throw new AssertionError("Поле '" + f + "' пустое в: " + truncate(n.toString()));
            return null;
        }
        return new BigDecimal(s);
    }

    static boolean bool(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return false;
        }
        return v.asBoolean();
    }

    static JsonNode arr(JsonNode n, String f, String ctx, String rawBody) {
        JsonNode v = n.get(f);
        if (v == null || !v.isArray()) {
            throw new AssertionError("Ожидался массив '" + f + "' в " + ctx + "; тело: " + truncate(rawBody));
        }
        return v;
    }
}
