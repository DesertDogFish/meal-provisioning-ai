package com.provision.integration;


import static com.provision.integration.EconomicConsistencySupport.*;
import static org.assertj.core.api.Assertions.assertThat;
import java.math.BigDecimal;
import static org.assertj.core.api.Assertions.within;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EconomicConsistencyPersonTest extends EconomicConsistencyTestBase {

    // ==================== ЭКРАН: НА ЧЕЛОВЕКА ====================

    @Test
    @DisplayName("EK-04 На человека: TPM=24, perDefault=353, perMeal=59, ккал/приём=446")
    void personSummary() throws Exception {
        createFixtures();
        var p = parsePerson(objectMapper, getTrip("/summary/person"));

        assertThat(p.totalPersonMeals()).as("10+4+6+4").isEqualTo(24);
        assertThat(p.plannedCostPerDefaultPerson()).isEqualByComparingTo("353");
        assertThat(p.actualCostPerDefaultPerson()).isEqualByComparingTo("353");
        assertThat(p.plannedCostPerPersonMeal()).isEqualByComparingTo("59");
        assertThat(p.caloriesPerPersonMeal()).isEqualByComparingTo("446");

        // Позиции «на человека»: Гречка 5.7/4=1.425 и 5.7/24=0.2375→0.238
        var grechka = p.byName("ЭК Гречка");
        assertThat(grechka.amountPerDefaultPerson()).isEqualByComparingTo("1.425");
        assertThat(grechka.amountPerPersonMeal()).isEqualByComparingTo("0.238");
        assertThat(grechka.plannedCostPerDefaultPerson()).isEqualByComparingTo("142.50");

        // Инвариант: пер-человек × люди ≈ точный итог (±0.5 — округление до рублей).
        var exactTotal = exactSum(parseShopping(objectMapper, getTrip("/summary/shopping")).items(), true);
        assertThat(p.plannedCostPerDefaultPerson().multiply(BigDecimal.valueOf(DEFAULT_PEOPLE)))
                .isCloseTo(exactTotal, within(new BigDecimal("2.0")));
    }

}
