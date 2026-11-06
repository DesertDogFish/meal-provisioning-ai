package com.provision.integration;


import static com.provision.integration.EconomicConsistencySupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EconomicConsistencyScreensTest extends EconomicConsistencyTestBase {

    // ==================== КОНСИСТЕНТНОСТЬ ВСЕХ ЭКРАНОВ ====================

    @Test
    @DisplayName("EK-10 Консистентность: меню/закупка/дни/человек/состав сходятся между собой")
    void allScreensConsistent() throws Exception {
        createFixtures();
        var menu = parseMenu(objectMapper, getTrip("/summary/menu"));
        var shopping = parseShopping(objectMapper, getTrip("/summary/shopping"));
        var byDays = parseDayShopping(objectMapper, getTrip("/summary/shopping/by-days"));
        var person = parsePerson(objectMapper, getTrip("/summary/person"));

        // 1. Вес меню БЕЗ правок состава: 2.0+10+0.1 | 0.8+0.2+1.5+0.3 | 0.8+4+0.04 — это
        //    базовый рецепт; закупка отличается на правки — сверяем её саму с собой и с днями.
        var menuWeight = BigDecimal.ZERO;
        for (var d : menu) {
            for (var m : d.meals()) {
                for (var ing : m.ingredients()) {
                    menuWeight = menuWeight.add(ing.amount());
                }
            }
        }
        assertThat(menuWeight).isEqualByComparingTo("19.740");

        // 2. Σ точных планов по дням == Σ точных планов закупки == точный итог.
        var daysSum = BigDecimal.ZERO;
        for (var d : byDays) {
            daysSum = daysSum.add(exactSum(d.items(), true));
        }
        var shoppingSum = exactSum(shopping.items(), true);
        assertThat(daysSum).isEqualByComparingTo("1410.00");
        assertThat(shoppingSum).isEqualByComparingTo(daysSum);
        assertThat(shopping.totalPlannedCost()).isEqualByComparingTo(roundToRub(shoppingSum));

        // 3. Итоги экрана == round(Σ позиций) — округление не теряет и не придумывает деньги.
        var daysRounded = byDays.stream()
                .map(DayShopping::plannedCost).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(daysRounded).isEqualByComparingTo(shopping.totalPlannedCost());

        // 4. «На человека» согласован с итогом и TPM (модель людей — Σ peopleOverride блюд).
        assertThat(person.totalPersonMeals()).isEqualTo(24);
        assertThat(person.plannedCostPerPersonMeal())
                .isEqualByComparingTo(roundToRub(shoppingSum.divide(BigDecimal.valueOf(24), 2, RoundingMode.HALF_UP)));
        assertThat(person.plannedCostPerDefaultPerson())
                .isEqualByComparingTo(roundToRub(shoppingSum.divide(BigDecimal.valueOf(DEFAULT_PEOPLE), 2, RoundingMode.HALF_UP)));

        // 5. Состав каждого приёма в сумме даёт его вклад в день (план), а дни — закупку.
        //    Д3 один приём: totals состава == plannedCost дня.
        var d3 = getComposition(mealD3R1Id);
        var day3 = byDays.get(2);
        assertThat(d3.totalsPlannedCost()).isEqualByComparingTo(exactSum(day3.items(), true));

        // 6. Позиции «на человека» × defaultPeople == количества закупки (±округление).
        for (var pi : person.ingredients()) {
            var si = shopping.byName(pi.ingredientName());
            assertThat(pi.amountPerDefaultPerson().multiply(BigDecimal.valueOf(DEFAULT_PEOPLE)))
                    .as("%s: amountPerDefaultPerson × 4 == totalAmount", pi.ingredientName())
                    .isEqualByComparingTo(si.totalAmount().setScale(3, RoundingMode.HALF_UP));
        }
    }

}
