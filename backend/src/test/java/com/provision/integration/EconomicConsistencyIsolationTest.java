package com.provision.integration;


import static com.provision.integration.EconomicConsistencySupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EconomicConsistencyIsolationTest extends EconomicConsistencyTestBase {

    // ==================== ИЗОЛЯЦИЯ V20 (ЗАМОРОЗКА ПЛАНА) ====================

    @Test
    @DisplayName("EK-07 Изоляция: глобальные цены/рецепты ПОСЛЕ планирования поход не меняют")
    void isolationFrozenPlan() throws Exception {
        createFixtures();
        var before = parseShopping(objectMapper, getTrip("/summary/shopping")).totalPlannedCost();
        assertThat(before).isEqualByComparingTo("1410");

        // Админ меняет глобальную цену (дата внутри окна похода) и создаёт новую глобальную
        // цену задним числом — замороженный план похода обязан остаться прежним.
        setPrice(grechkaId, "999.00", "2026-07-03");
        setPrice(grechkaId, "150.00", "2026-06-15");
        setPrice(sgushId, "700.00", "2026-06-01");

        var after = parseShopping(objectMapper, getTrip("/summary/shopping"));
        assertThat(after.totalPlannedCost()).isEqualByComparingTo("1410");
        assertThat(after.unit("ЭК Гречка", true)).isEqualByComparingTo("100.00");
        assertThat(after.unit("ЭК Сгущёнка", true)).isEqualByComparingTo("300.00");

        // Цены похода (GET /trips/{id}/prices) — только замороженные снепшот-строки ≤ startDate.
        var pricesRes = mockMvc.perform(get("/api/v1/trips/" + tripId + "/prices")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
        var prices = objectMapper.readTree(body(pricesRes));
        assertThat(prices.isArray()).isTrue();
        boolean grechkaSeen = false;
        for (var p : prices) {
            assertThat(text(p, "effectiveFrom", true).substring(0, 10))
                    .as("заброшенная в поход цена действует не позже старта похода")
                    .isLessThanOrEqualTo(START.toString());
            if (lng(p, "ingredientId", true) == snapshotOf(grechkaId)) {
                grechkaSeen = true;
                assertThat(dec(p, "pricePerUnit", true)).isEqualByComparingTo("100.00");
            }
        }
        assertThat(grechkaSeen).as("снепшот Гречки имеет замороженную цену").isTrue();
    }

}
