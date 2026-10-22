package com.provision.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.ingredient.IngredientPriceRequest;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * P0-3 (real-режим): regression-тесты нового публичного эндпоинта цен GET /api/v1/prices.
 *
 * Предыстория: фронтенд грузил цены с GET /admin/prices, которого на бэкенде не было,
 * а реальный список цен (/api/v1/admin/ingredient-prices) был закрыт hasRole('ADMIN').
 * В real-режиме страницы походов падали у всех, включая обычного USER.
 *
 * PRICES-01: неаутентифицированный запрос -> 401
 * PRICES-02: обычный USER получает 200 и актуальные цены (главная регрессия P0-3)
 * PRICES-03: ADMIN тоже получает 200
 * PRICES-04: /prices возвращает ПОСЛЕДНИЙ действующий срез на ингредиент (не всю историю)
 * PRICES-05: asOf — цена на дату (срез до asOf включительно)
 * PRICES-06: relevant-to-trips доступен USER (200, пустой список без блюд в походах)
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("User Prices Integration Tests (P0-3)")
class UserPricesIntegrationTest {

    private static final boolean LOCAL_PG = !com.provision.integration.LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_prices")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? com.provision.integration.LocalPgFallback.jdbcUrl("provision_test_prices") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired private org.flywaydb.core.Flyway flyway;

    private String userToken;
    private String adminToken;
    private Long ingredientId;

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "prices-user@test.com");
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "prices-admin@test.com");

        // Сеанс данных: ингредиент + два среза цены (февральский дешевле июльского)
        MvcResult ing = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"p03-grecha\",\"name\":\"Гречка P03\",\"unit\":\"KG\",\"category\":\"Зерновые\",\"kcalPer100g\":343}"))
                .andExpect(status().isCreated())
                .andReturn();
        ingredientId = readId(ing);

        addPrice(new IngredientPriceRequest(ingredientId, new BigDecimal("80.00"), LocalDate.of(2026, 2, 1), "RUB"));
        addPrice(new IngredientPriceRequest(ingredientId, new BigDecimal("95.50"), LocalDate.of(2026, 7, 1), "RUB"));
    }

    private void addPrice(IngredientPriceRequest req) throws Exception {
        mockMvc.perform(post("/api/v1/admin/ingredient-prices")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    private Long readId(MvcResult r) throws Exception {
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asLong();
    }

    @Test
    @Order(1)
    @DisplayName("PRICES-01: без токена -> 401")
    void prices01_requiresAuth() throws Exception {
        mockMvc.perform(get("/api/v1/prices")).andExpect(status().isUnauthorized());
    }

    @Test
    @Order(2)
    @DisplayName("PRICES-02: обычный USER видит цены (регрессия P0-3)")
    void prices02_userCanReadPrices() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/prices")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$[0].ingredientId").value(ingredientId))
                .andReturn();
        // цена должна быть актуальной (июльский срез), а не февральский
        Assertions.assertEquals(0, new BigDecimal("95.50").compareTo(
                new BigDecimal(objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8))
                        .get(0).get("pricePerUnit").asText())));
    }

    @Test
    @Order(3)
    @DisplayName("PRICES-03: ADMIN тоже получает 200")
    void prices03_adminCanReadPrices() throws Exception {
        mockMvc.perform(get("/api/v1/prices")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
    }

    @Test
    @Order(4)
    @DisplayName("PRICES-05: asOf отдаёт срез на указанную дату (февраль -> 80.00)")
    void prices05_asOfReturnsHistoricalSlice() throws Exception {
        mockMvc.perform(get("/api/v1/prices")
                        .param("asOf", "2026-03-15")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].pricePerUnit").value(org.hamcrest.Matchers.comparesEqualTo(new BigDecimal("80.00"))))
                .andExpect(jsonPath("$[0].effectiveFrom").value("2026-02-01"));
    }

    @Test
    @Order(5)
    @DisplayName("PRICES-06: relevant-to-trips доступен USER")
    void prices06_relevantToTripsForUser() throws Exception {
        // У пользователя пока нет походов с блюдами -> пустой список, но НЕ 403
        mockMvc.perform(get("/api/v1/prices/relevant-to-trips")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }
}
