package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.trip.TripMealRequest;
import com.provision.dto.trip.TripRequest;
import com.provision.entity.MealType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * V20: изоляция каталога похода (copy-on-write снепшоты).
 *
 * SNAPSHOT-01: добавление приёма пищи создаёт trip-scoped копии рецепта и продуктов;
 *              глобальный справочник не засвечивается.
 * SNAPSHOT-02: правка глобальной цены НЕ меняет план похода (план заморожен снепшотом),
 *              при этом GET /prices отдаёт новую цену, а GET /trips/{id}/prices — старую.
 * SNAPSHOT-03: админ удаляет глобальное блюдо, занятое походом, — 204, поход продолжает
 *              считаться (копия жива), из каталога блюдо исчезло.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("V20: Snapshot isolation of trip catalog")
class SnapshotIsolationIntegrationTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_snapshot")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG
                ? LocalPgFallback.jdbcUrl("provision_test_snapshot")
                : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> "test");
        registry.add("spring.datasource.password", () -> "test");
    }

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    static String userToken;
    static String adminToken;
    static Long tripId;
    static Long dayId;
    static Long globalRecipeId;
    static Long globalBuckwheatId;
    static String targetFirstIngNameStatic;
    static String targetNameStatic;

    private String auth(String token) {
        return "Bearer " + token;
    }

    @Test
    @Order(1)
    @DisplayName("SNAPSHOT-01: meal addition copies recipe+products into trip scope")
    void snapshot01_mealCreatesTripScopedCopies() throws Exception {
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "snap_user@test.com");
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "snap_admin@test.com");

        // глобальное блюдо из сида
        MvcResult recRes = mockMvc.perform(get("/api/v1/recipes").header("Authorization", auth(userToken)))
                .andExpect(status().isOk()).andReturn();
        String recipesBody = recRes.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode recipes = objectMapper.readTree(recipesBody);
        // Целевое блюдо выбираем структурно (первое глобальное с составом), чтобы тест
        // не зависел от конкретных имён сида и кодировок окружения.
        JsonNode target = null;
        String targetName = null;
        String targetFirstIngName = null;
        for (JsonNode r : recipes) {
            JsonNode ings = r.get("ingredients");
            if (ings != null && ings.size() > 0 && ings.get(0).get("ingredientName") != null) {
                target = r;
                targetName = r.get("name").asText();
                targetFirstIngName = ings.get(0).get("ingredientName").asText();
                break;
            }
        }
        assertThat(target).as("global catalog must expose recipes with ingredients").isNotNull();
        globalRecipeId = target.get("id").asLong();
        targetFirstIngNameStatic = targetFirstIngName;
        targetNameStatic = targetName;

        int recipesBefore = recipes.size();
        int productsBefore = objectMapper.readTree(mockMvc.perform(
                        get("/api/v1/admin/products").header("Authorization", auth(adminToken)))
                        .andExpect(status().isOk()).andReturn()
                        .getResponse().getContentAsString(StandardCharsets.UTF_8)).get("totalElements").asInt();

        // поход + приём пищи
        MvcResult tripRes = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new TripRequest(
                                "Снепшот IT", LocalDate.now().plusDays(30), LocalDate.now().plusDays(31), 2, null))))
                .andExpect(status().isCreated()).andReturn();
        JsonNode trip = objectMapper.readTree(tripRes.getResponse().getContentAsString(StandardCharsets.UTF_8));
        tripId = trip.get("id").asLong();
        dayId = trip.get("days").get(0).get("id").asLong();

        mockMvc.perform(post("/api/v1/trips/" + tripId + "/days/" + dayId + "/meals")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new TripMealRequest(MealType.DINNER, globalRecipeId, null, 0))))
                .andExpect(status().isCreated());

        // копия рецепта: trip_id проставлен, snapshot_of указывает на оригинал
        Integer copies = jdbc.queryForObject(
                "SELECT count(*) FROM recipes WHERE trip_id = ? AND snapshot_of = ?",
                Integer.class, tripId, globalRecipeId);
        assertThat(copies).isEqualTo(1);

        // приём пищи ссылается НЕ на глобальный рецепт
        Long mealRecipeId = jdbc.queryForObject(
                "SELECT recipe_id FROM trip_meals tm JOIN trip_days td ON td.id = tm.trip_day_id WHERE td.trip_id = ?",
                Long.class, tripId);
        assertThat(mealRecipeId).isNotEqualTo(globalRecipeId);

        // копии продуктов с замороженной ценой
        Integer ingCopies = jdbc.queryForObject(
                "SELECT count(*) FROM ingredients i WHERE i.trip_id = ? AND i.snapshot_of IS NOT NULL",
                Integer.class, tripId);
        assertThat(ingCopies).isEqualTo(target.get("ingredients").size());
        Integer copiesWithPrice = jdbc.queryForObject(
                "SELECT count(*) FROM ingredients i JOIN ingredient_prices p ON p.ingredient_id = i.id WHERE i.trip_id = ?",
                Integer.class, tripId);
        assertThat(copiesWithPrice).isEqualTo(ingCopies);

        // каталоги не засвечены копиями
        MvcResult after = mockMvc.perform(get("/api/v1/recipes").header("Authorization", auth(userToken)))
                .andExpect(status().isOk()).andReturn();
        assertThat(objectMapper.readTree(after.getResponse().getContentAsString(StandardCharsets.UTF_8)).size())
                .isEqualTo(recipesBefore);
        int productsAfter = objectMapper.readTree(mockMvc.perform(
                        get("/api/v1/admin/products").header("Authorization", auth(adminToken)))
                        .andExpect(status().isOk()).andReturn()
                        .getResponse().getContentAsString(StandardCharsets.UTF_8)).get("totalElements").asInt();
        assertThat(productsAfter).isEqualTo(productsBefore);

        globalBuckwheatId = jdbc.queryForObject(
                "SELECT id FROM ingredients WHERE trip_id IS NULL AND name = ?",
                Long.class, targetFirstIngNameStatic);
    }

    @Test
    @Order(2)
    @DisplayName("SNAPSHOT-02: global price change does not affect trip plan")
    void snapshot02_priceFreeze() throws Exception {
        assertThat(globalBuckwheatId).isNotNull();

        MvcResult before = mockMvc.perform(get("/api/v1/trips/" + tripId + "/summary/shopping")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk()).andReturn();
        JsonNode itemsBefore = objectMapper.readTree(
                before.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("items");
        double plannedBefore = 0;
        for (JsonNode it : itemsBefore) {
            if (targetFirstIngNameStatic.equals(it.get("ingredientName").asText())) {
                plannedBefore = it.get("plannedUnitPrice").asDouble();
            }
        }
        assertThat(plannedBefore).isGreaterThan(0);

        // админ ставит новую глобальную цену «с сегодня»
        mockMvc.perform(post("/api/v1/admin/ingredient-prices")
                        .header("Authorization", auth(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "ingredientId", globalBuckwheatId,
                                "pricePerUnit", 999.99,
                                "currency", "RUB",
                                "effectiveFrom", LocalDate.now().toString()))))
                .andExpect(status().isCreated());

        // план похода НЕ изменился
        MvcResult after = mockMvc.perform(get("/api/v1/trips/" + tripId + "/summary/shopping")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk()).andReturn();
        JsonNode itemsAfter = objectMapper.readTree(
                after.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("items");
        double plannedAfter = 0;
        for (JsonNode it : itemsAfter) {
            if (targetFirstIngNameStatic.equals(it.get("ingredientName").asText())) {
                plannedAfter = it.get("plannedUnitPrice").asDouble();
            }
        }
        assertThat(plannedAfter).isEqualTo(plannedBefore);

        // глобальный справочник цен показывает новую цену, trip-prices — старую
        MvcResult globalPrices = mockMvc.perform(get("/api/v1/prices")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk()).andReturn();
        boolean globalHas999 = globalPrices.getResponse().getContentAsString(StandardCharsets.UTF_8).contains("999.99");
        assertThat(globalHas999).isTrue();

        MvcResult tripPrices = mockMvc.perform(get("/api/v1/trips/" + tripId + "/prices")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk()).andReturn();
        String tripPricesBody = tripPrices.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(tripPricesBody).doesNotContain("999.99");
    }

    @Test
    @Order(3)
    @DisplayName("SNAPSHOT-03: admin deletes global recipe used by trip — 204, trip alive")
    void snapshot03_globalRecipeDeletableWhileTripUsesCopy() throws Exception {
        mockMvc.perform(delete("/api/v1/admin/recipes/" + globalRecipeId)
                        .header("Authorization", auth(adminToken)))
                .andExpect(status().isNoContent());

        // из каталога исчезло
        MvcResult cat = mockMvc.perform(get("/api/v1/recipes").header("Authorization", auth(userToken)))
                .andExpect(status().isOk()).andReturn();
        assertThat(cat.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain(targetNameStatic);

        // поход продолжает считаться из копии
        MvcResult shopping = mockMvc.perform(get("/api/v1/trips/" + tripId + "/summary/shopping")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk()).andReturn();
        String body = shopping.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains(targetFirstIngNameStatic);

        Integer meals = jdbc.queryForObject(
                "SELECT count(*) FROM trip_meals tm JOIN trip_days td ON td.id = tm.trip_day_id WHERE td.trip_id = ?",
                Integer.class, tripId);
        assertThat(meals).isEqualTo(1);
    }
}
