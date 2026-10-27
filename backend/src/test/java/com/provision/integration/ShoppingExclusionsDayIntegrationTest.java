package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.trip.ShoppingExclusionDtos;
import com.provision.dto.trip.TripRequest;
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

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Fix-5 / PLAN R2 (шаг 2): серверные исключения закупки с по-дневной областью.
 * V23: trip_shopping_exclusions.day_date (NULL = весь поход), уникальность —
 * два partial-индекса; контракт PUT/GET — {items:[{ingredientId, dayDate|null}]}.
 *
 * SE-01: PUT items (глобальное + дневное) → 200, GET отдаёт обе формы с dayDate.
 * SE-02: один продукт одновременно глобально и по дням — не конфликтует (partial-индексы).
 * SE-03: повторный PUT идемпотентно заменяет набор (старые строки стираются).
 * SE-04: legacy-форма {ingredientIds} по-прежнему принимается (глобальные).
 * SE-05: чужой поход → 404.
 *
 * ВНИМАНИЕ: в окружении подготовки патча тест прогнан локально на PG (LocalPgFallback).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Shopping Exclusions Day-Scope Integration Tests (Fix-5 / R2-2)")
class ShoppingExclusionsDayIntegrationTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_excl")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? LocalPgFallback.jdbcUrl("provision_test_excl") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired private org.flywaydb.core.Flyway flyway;

    private static String userToken;
    private static String otherToken;
    private static String adminToken;
    private static Long tripId;
    private static Long ingredientA;
    private static Long ingredientB;

    private String auth(String t) { return "Bearer " + t; }

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "excl-user@test.com");
        otherToken = TestUsers.registerUser(mockMvc, objectMapper, "excl-other@test.com");
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "excl-admin@test.com");

        ingredientA = createIngredient("excl-a", "SE Гречка");
        ingredientB = createIngredient("excl-b", "SE Соль");

        MvcResult tripRes = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new TripRequest(
                                "SE Поход", LocalDate.now().plusDays(50), LocalDate.now().plusDays(52), 2, null))))
                .andExpect(status().isCreated())
                .andReturn();
        tripId = objectMapper.readTree(tripRes.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asLong();
    }

    private Long createIngredient(String code, String name) throws Exception {
        MvcResult r = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", auth(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"" + code + "\",\"name\":\"" + name + "\",\"unit\":\"KG\",\"category\":\"Зерновые\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asLong();
    }

    private JsonNode putItems(List<ShoppingExclusionDtos.ExclusionItem> items) throws Exception {
        MvcResult r = mockMvc.perform(put("/api/v1/trips/" + tripId + "/shopping-exclusions")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ShoppingExclusionDtos.ExclusionsBody(null, items))))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode getList() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/trips/" + tripId + "/shopping-exclusions")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    @Order(1)
    @DisplayName("SE-01/02: глобальное + дневное исключение одного продукта сосуществуют")
    void se01_mixedScopes() throws Exception {
        putItems(List.of(
                new ShoppingExclusionDtos.ExclusionItem(ingredientA, null),
                new ShoppingExclusionDtos.ExclusionItem(ingredientB, LocalDate.now().plusDays(51)),
                new ShoppingExclusionDtos.ExclusionItem(ingredientA, LocalDate.now().plusDays(52))
        ));
        JsonNode list = getList();
        assertThat(list).hasSize(3);
        boolean hasGlobalA = false, hasDayB = false;
        for (JsonNode n : list) {
            if (n.get("ingredientId").asLong() == ingredientA && n.get("dayDate").isNull()) hasGlobalA = true;
            if (n.get("ingredientId").asLong() == ingredientB && !n.get("dayDate").isNull()) hasDayB = true;
        }
        assertThat(hasGlobalA).isTrue();
        assertThat(hasDayB).isTrue();
    }

    @Test
    @Order(2)
    @DisplayName("SE-03: повторный PUT полностью заменяет набор (идемпотентно)")
    void se03_replaceAll() throws Exception {
        putItems(List.of(new ShoppingExclusionDtos.ExclusionItem(ingredientA, null)));
        putItems(List.of(new ShoppingExclusionDtos.ExclusionItem(ingredientB, null)));
        JsonNode list = getList();
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("ingredientId").asLong()).isEqualTo(ingredientB);
    }

    @Test
    @Order(3)
    @DisplayName("SE-04: legacy-форма {ingredientIds} принимается как глобальные исключения")
    void se04_legacyForm() throws Exception {
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/shopping-exclusions")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ingredientIds\":[" + ingredientA + "," + ingredientB + "]}"))
                .andExpect(status().isOk());
        JsonNode list = getList();
        assertThat(list).hasSize(2);
        for (JsonNode n : list) {
            assertThat(n.get("dayDate").isNull()).isTrue();
        }
    }

    @Test
    @Order(4)
    @DisplayName("SE-05: чужой поход → 404")
    void se05_ownership() throws Exception {
        mockMvc.perform(get("/api/v1/trips/" + tripId + "/shopping-exclusions")
                        .header("Authorization", auth(otherToken)))
                .andExpect(status().isNotFound());
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/shopping-exclusions")
                        .header("Authorization", auth(otherToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[]}"))
                .andExpect(status().isNotFound());
    }
}
