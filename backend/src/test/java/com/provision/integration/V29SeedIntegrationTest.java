package com.provision.integration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ContainerSuite
@DisplayName("BL-6: V29 seed - 191 linked and 13 unlinked")
class V29SeedIntegrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private org.flywaydb.core.Flyway flyway;

    @BeforeEach
    void setUp() {
        TestDataIsolation.reset(jdbc, flyway);
    }

    @Test
    @DisplayName("Final count: 191 global products with emis_code and 13 without")
    void seedCounts() {
        Long linked = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ingredients WHERE emis_code IS NOT NULL AND trip_id IS NULL",
                Long.class);
        Long unlinked = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ingredients WHERE emis_code IS NULL AND trip_id IS NULL",
                Long.class);

        assertThat(linked).as("global products linked to EMIS").isEqualTo(191L);
        assertThat(unlinked).as("global products without binding").isEqualTo(13L);
    }

    @Test
    @DisplayName("Toilet paper roll: piece_weight_g = 75, price per roll (div 4)")
    void toiletPaperReunited() {
        BigDecimal pieceWeight = jdbc.queryForObject(
                "SELECT piece_weight_g FROM ingredients WHERE code = 'toilet_paper' AND trip_id IS NULL",
                BigDecimal.class);
        assertThat(pieceWeight).isEqualByComparingTo("75.00");

        BigDecimal price = jdbc.queryForObject(
                "SELECT p.price_per_unit FROM ingredient_prices p "
                        + "JOIN ingredients i ON i.id = p.ingredient_id "
                        + "WHERE i.code = 'toilet_paper' AND i.trip_id IS NULL "
                        + "AND p.effective_from = DATE '2026-01-01'",
                BigDecimal.class);
        assertThat(price).isEqualByComparingTo("20.00");
    }

    @Test
    @DisplayName("Wet wipes pack 20 pcs: piece_weight_g = 70, price div 5")
    void wipesReunited() {
        BigDecimal pieceWeight = jdbc.queryForObject(
                "SELECT piece_weight_g FROM ingredients WHERE code = 'wipes_wet' AND trip_id IS NULL",
                BigDecimal.class);
        assertThat(pieceWeight).isEqualByComparingTo("70.00");

        BigDecimal price = jdbc.queryForObject(
                "SELECT p.price_per_unit FROM ingredient_prices p "
                        + "JOIN ingredients i ON i.id = p.ingredient_id "
                        + "WHERE i.code = 'wipes_wet' AND i.trip_id IS NULL "
                        + "AND p.effective_from = DATE '2026-01-01'",
                BigDecimal.class);
        assertThat(price).isEqualByComparingTo("30.00");
    }

    @Test
    @DisplayName("Matches box: piece_weight_g = 15, price div 20")
    void matchesReunited() {
        BigDecimal pieceWeight = jdbc.queryForObject(
                "SELECT piece_weight_g FROM ingredients WHERE code = 'matches_waterproof' AND trip_id IS NULL",
                BigDecimal.class);
        assertThat(pieceWeight).isEqualByComparingTo("15.00");

        BigDecimal price = jdbc.queryForObject(
                "SELECT p.price_per_unit FROM ingredient_prices p "
                        + "JOIN ingredients i ON i.id = p.ingredient_id "
                        + "WHERE i.code = 'matches_waterproof' AND i.trip_id IS NULL "
                        + "AND p.effective_from = DATE '2026-01-01'",
                BigDecimal.class);
        assertThat(price).isEqualByComparingTo("3.00");
    }

    @Test
    @DisplayName("Explicitly unlinked: gas_canister/soy_sauce/vinegar - emis_code IS NULL")
    void explicitlyUnlinkedProducts() {
        Integer linked = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ingredients WHERE trip_id IS NULL "
                        + "AND code IN ('gas_canister', 'soy_sauce', 'vinegar') AND emis_code IS NOT NULL",
                Integer.class);
        assertThat(linked).as("these products must not have bindings").isZero();
    }
}
