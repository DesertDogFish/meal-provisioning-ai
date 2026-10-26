package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.recipe.RecipeRequest;
import com.provision.dto.trip.TripMealRequest;
import com.provision.dto.trip.TripRequest;
import com.provision.entity.MealType;
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
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Fix-4 (список 26.10, итерация 4): «невозможно опять изменять блюда, которые
 * где-то используются — An unexpected error occurred».
 *
 * V20-контракт: правки справочника НЕ блокируются походами (походы живут на
 * снепшотах). Редактирование блюда, использованного в приёме пищи, обязано
 * возвращать 200, а поход — продолжать считаться из своей копии.
 *
 * RU-01: PUT /admin/recipes/{id} для блюда, занятого поездом → 200, имя обновлено.
 * RU-02: снепшот похода не затронут (изоляция V20).
 * RU-03: GET /recipes отдаёт расширенные поля ингредиента (categoryName/packSize —
 *        Fix-2 п.3/4) — чек/чеклист получают категории в real-режиме.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Recipe Update In-Use Integration Tests (Fix-4)")
class RecipeUpdateInUseIntegrationTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_recipeupd")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? LocalPgFallback.jdbcUrl("provision_test_recipeupd") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired private org.flywaydb.core.Flyway flyway;

    private static String adminToken;
    private static String userToken;
    private static Long ingredientId;
    private static Long recipeId;
    private static Long tripId;
    private static final String recipeName = "RU-Тестовое блюдо";
    private static final String updatedName = "RU-Тестовое блюдо v2";

    private String auth(String t) { return "Bearer " + t; }

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "ru-admin@test.com");
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "ru-user@test.com");

        // продукт
        MvcResult ing = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", auth(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"ru-grecha\",\"name\":\"RU Гречка\",\"unit\":\"KG\",\"category\":\"Зерновые\",\"kcalPer100g\":343,\"packSize\":0.9,\"roundToPacks\":true}"))
                .andExpect(status().isCreated())
                .andReturn();
        ingredientId = objectMapper.readTree(ing.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asLong();

        // блюдо из одного ингредиента
        MvcResult rec = mockMvc.perform(post("/api/v1/admin/recipes")
                        .header("Authorization", auth(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RecipeRequest(
                                recipeName, MealType.LUNCH, "Тестовые", 10, 2, null,
                                List.of(new RecipeRequest.RecipeIngredientItem(ingredientId, new BigDecimal("0.2")))))))
                .andExpect(status().isCreated())
                .andReturn();
        recipeId = objectMapper.readTree(rec.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asLong();

        // поход + приём пищи → создаётся V20-снепшот блюда (блюдо «занято»)
        MvcResult tripRes = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new TripRequest(
                                "RU Поход", LocalDate.now().plusDays(40), LocalDate.now().plusDays(41), 2, null))))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode trip = objectMapper.readTree(tripRes.getResponse().getContentAsString(StandardCharsets.UTF_8));
        tripId = trip.get("id").asLong();
        Long dayId = trip.get("days").get(0).get("id").asLong();
        mockMvc.perform(post("/api/v1/trips/" + tripId + "/days/" + dayId + "/meals")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new TripMealRequest(MealType.LUNCH, recipeId, null, 0))))
                .andExpect(status().isCreated());
    }

    @Test
    @Order(1)
    @DisplayName("RU-01: PUT занятого блюда → 200 (V20: правки каталога не блокируются походами)")
    void ru01_updateUsedRecipe() throws Exception {
        MvcResult res = mockMvc.perform(put("/api/v1/admin/recipes/" + recipeId)
                        .header("Authorization", auth(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RecipeRequest(
                                updatedName, MealType.LUNCH, "Тестовые", 10, 2, null,
                                List.of(new RecipeRequest.RecipeIngredientItem(ingredientId, new BigDecimal("0.3")))))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(body.get("name").asText()).isEqualTo(updatedName);
    }

    @Test
    @Order(2)
    @DisplayName("RU-02: после правки каталога снепшот похода сохраняет старое блюдо (изоляция V20)")
    void ru02_snapshotIsolation() throws Exception {
        // правка из RU-01 не гарантирована по порядку в общем контексте — выполняем её и здесь
        mockMvc.perform(put("/api/v1/admin/recipes/" + recipeId)
                        .header("Authorization", auth(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RecipeRequest(
                                updatedName, MealType.LUNCH, "Тестовые", 10, 2, null,
                                List.of(new RecipeRequest.RecipeIngredientItem(ingredientId, new BigDecimal("0.3")))))))
                .andExpect(status().isOk());

        MvcResult tripRecipes = mockMvc.perform(get("/api/v1/trips/" + tripId + "/recipes")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk())
                .andReturn();
        String body = tripRecipes.getResponse().getContentAsString(StandardCharsets.UTF_8);
        // снепшот остался со СТАРЫМ именем — поход не «поехал» вслед за каталогом
        assertThat(body).contains(recipeName);
        assertThat(body).doesNotContain(updatedName);
    }

    @Test
    @Order(3)
    @DisplayName("RU-03: GET /recipes — расширенные поля ингредиента (categoryName/packSize/roundToPacks)")
    void ru03_extendedIngredientDto() throws Exception {
        MvcResult res = mockMvc.perform(get("/api/v1/recipes").header("Authorization", auth(userToken)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode arr = objectMapper.readTree(res.getResponse().getContentAsString(StandardCharsets.UTF_8));
        JsonNode recipe = null;
        for (JsonNode r : arr) {
            if (r.get("id").asLong() == recipeId) { recipe = r; break; }
        }
        assertThat(recipe).isNotNull();
        JsonNode ingRow = recipe.get("ingredients").get(0);
        assertThat(ingRow.get("categoryName").asText()).isNotBlank();
        assertThat(ingRow.get("packSize").decimalValue()).isEqualByComparingTo("0.9");
        assertThat(ingRow.get("roundToPacks").asBoolean()).isTrue();
        assertThat(ingRow.get("ingredientName").asText()).isEqualTo("RU Гречка");
    }
}
