package com.provision.integration;


import static com.provision.integration.EconomicConsistencySupport.*;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EconomicConsistencyMenuTest extends EconomicConsistencyTestBase {

    @Test
    @DisplayName("EK-01 Меню: количества = рецепт/base×people, правки состава меню НЕ касаются")
    void menuByDays() throws Exception {
        createFixtures();
        var days = parseMenu(objectMapper, getTrip("/summary/menu"));
        assertThat(days).hasSize(3);

        var d1 = days.get(0);
        assertThat(d1.dayDate()).isEqualTo("2026-07-01");
        assertThat(d1.effectivePeople()).isEqualTo(DEFAULT_PEOPLE);
        assertThat(d1.meals()).hasSize(1);
        var m1 = d1.meals().get(0);
        assertThat(m1.recipeName()).isEqualTo("ЭК Каша гречневая");
        assertThat(m1.servings()).isEqualTo(10);
        assertThat(m1.amount("ЭК Гречка")).isEqualByComparingTo("2.000");
        assertThat(m1.amount("ЭК Тушёнка")).isEqualByComparingTo("10.000");
        assertThat(m1.amount("ЭК Соль")).isEqualByComparingTo("0.100");

        var d2 = days.get(1);
        assertThat(d2.meals()).hasSize(2);
        assertThat(d2.meals().get(0).servings()).as("без оверрайда → defaultPeople").isEqualTo(4);
        assertThat(d2.meals().get(0).amount("ЭК Рис")).isEqualByComparingTo("0.800");
        assertThat(d2.meals().get(0).amount("ЭК Масло")).isEqualByComparingTo("0.200");
        assertThat(d2.meals().get(1).servings()).isEqualTo(6);
        assertThat(d2.meals().get(1).amount("ЭК Гречка")).isEqualByComparingTo("1.500");
        assertThat(d2.meals().get(1).amount("ЭК Масло")).isEqualByComparingTo("0.300");

        var d3 = days.get(2);
        assertThat(d3.meals().get(0).servings()).isEqualTo(4);
        assertThat(d3.meals().get(0).amount("ЭК Гречка")).isEqualByComparingTo("0.800");
        assertThat(d3.meals().get(0).amount("ЭК Тушёнка")).isEqualByComparingTo("4.000");
        assertThat(d3.meals().get(0).amount("ЭК Соль")).isEqualByComparingTo("0.040");
    }
}