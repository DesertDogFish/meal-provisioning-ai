package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Fix-2 (список багов 26.10, U40 / PLAN R3 + п.1): ручные позиции закупки и
 * ЧАСТИЧНОЕ стирание плана при смене дат похода.
 *
 * MI-01: trip-level позиция (dayId=null) создаётся и читается (форма ответа = mock/фронт).
 * MI-02: валидации — amount<=0 → 400, неизвестный продукт → 404, чужой день → 404.
 * MI-03: ownership — чужой поход → 404 (GET/POST/DELETE).
 * MI-04: смена дат: пересекающиеся дни сохраняются (тот же id), ушедший день
 *        удаляется ВМЕСТЕ со своей ручной позицией (FK CASCADE, V22), trip-level
 *        позиция переживает смену дат; новая дата добавляется.
 * MI-05: удаление позиции → 204, список пуст.
 *
 * ВНИМАНИЕ: в окружении подготовки патча Docker недоступен — тест написан по
 * шаблону ContainerSuite/LocalPgFallback и НЕ прогонялся локально; проверка — CI.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Trip Manual Items Integration Tests (Fix-2, U40/R3)")
class TripManualItemsIntegrationTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_manual")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? LocalPgFallback.jdbcUrl("provision_test_manual") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired private org.flywaydb.core.Flyway flyway;

    private String userToken;
    private String otherToken;
    private String adminToken;
    private Long ingredientId;
    private Long tripId;
    private Long firstDayId;   // 2026-06-01
    private Long secondDayId;  // 2026-06-02

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "manual-user@test.com");
        otherToken = TestUsers.registerUser(mockMvc, objectMapper, "manual-other@test.com");
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "manual-admin@test.com");

        MvcResult ing = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"mi-antiseptik\",\"name\":\"Антисептик для рук\",\"unit\":\"PCS\",\"category\":\"Хозтовары\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        ingredientId = readId(ing);

        MvcResult trip = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Поход MI\",\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-03\",\"defaultPeople\":2}"))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode tripJson = objectMapper.readTree(trip.getResponse().getContentAsString(StandardCharsets.UTF_8));
        tripId = tripJson.get("id").asLong();
        JsonNode days = tripJson.get("days");
        assertThat(days).hasSize(3);
        firstDayId = days.get(0).get("id").asLong();
        secondDayId = days.get(1).get("id").asLong();
    }

    private Long readId(MvcResult r) throws Exception {
        return Long.valueOf(objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asText());
    }

    private MvcResult addItem(String token, Long tId, String body) throws Exception {
        return mockMvc.perform(post("/api/v1/trips/" + tId + "/manual-items")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
    }

    @Test
    @Order(1)
    @DisplayName("MI-01: trip-level позиция создаётся (201) и читается; форма = контракту фронта")
    void mi01_createTripLevelItem() throws Exception {
        MvcResult created = addItem(userToken, tripId,
                "{\"ingredientId\":" + ingredientId + ",\"amount\":1,\"note\":\"аптечка\"}")
                ;
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        JsonNode item = objectMapper.readTree(created.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(item.get("dayId").isNull()).isTrue();
        assertThat(item.get("ingredientName").asText()).isEqualTo("Антисептик для рук");
        assertThat(item.get("unit").asText()).isEqualTo("PCS");
        assertThat(item.get("amount").decimalValue()).isEqualByComparingTo("1");

        MvcResult list = mockMvc.perform(get("/api/v1/trips/" + tripId + "/manual-items")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode arr = objectMapper.readTree(list.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(arr).hasSize(1);
        assertThat(arr.get(0).get("id").asLong()).isEqualTo(item.get("id").asLong());
    }

    @Test
    @Order(2)
    @DisplayName("MI-02: валидации — amount=0 → 400, неизвестный продукт → 404, чужой день → 404")
    void mi02_validations() throws Exception {
        assertThat(addItem(userToken, tripId,
                "{\"ingredientId\":" + ingredientId + ",\"amount\":0}").getResponse().getStatus())
                .isEqualTo(400);
        assertThat(addItem(userToken, tripId,
                "{\"ingredientId\":99999999,\"amount\":1}").getResponse().getStatus())
                .isEqualTo(404);
        assertThat(addItem(userToken, tripId,
                "{\"ingredientId\":" + ingredientId + ",\"amount\":1,\"dayId\":99999999}").getResponse().getStatus())
                .isEqualTo(404);
    }

    @Test
    @Order(3)
    @DisplayName("MI-03: чужой поход → 404 на GET/POST/DELETE (IDOR-защита)")
    void mi03_ownership() throws Exception {
        mockMvc.perform(get("/api/v1/trips/" + tripId + "/manual-items")
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound());
        assertThat(addItem(otherToken, tripId,
                "{\"ingredientId\":" + ingredientId + ",\"amount\":1}").getResponse().getStatus())
                .isEqualTo(404);
        mockMvc.perform(delete("/api/v1/trips/" + tripId + "/manual-items/1")
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound());
    }

    @Test
    @Order(4)
    @DisplayName("MI-04: смена дат — ушедший день стирается вместе с позицией (CASCADE), пересекающийся день сохраняется")
    void mi04_dateChangePartialWipe() throws Exception {
        // позиция к дню 2026-06-01 и trip-level позиция
        addItem(userToken, tripId,
                "{\"ingredientId\":" + ingredientId + ",\"amount\":2,\"dayId\":" + firstDayId + "}")
                .getResponse().getStatus();
        assertThat(addItem(userToken, tripId,
                "{\"ingredientId\":" + ingredientId + ",\"amount\":1}").getResponse().getStatus())
                .isEqualTo(201);

        // сдвигаем диапазон: 2026-06-02..2026-06-04 → день 06-01 исчезает, 06-04 добавляется
        MvcResult updated = mockMvc.perform(put("/api/v1/trips/" + tripId)
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Поход MI\",\"startDate\":\"2026-06-02\",\"endDate\":\"2026-06-04\",\"defaultPeople\":2}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode tripJson = objectMapper.readTree(updated.getResponse().getContentAsString(StandardCharsets.UTF_8));
        JsonNode days = tripJson.get("days");
        assertThat(days).hasSize(3);
        assertThat(days.get(0).get("dayDate").asText()).isEqualTo("2026-06-02");
        // пересекающийся день сохранил свой id (план не пересоздан)
        assertThat(days.get(0).get("id").asLong()).isEqualTo(secondDayId);
        assertThat(days.get(2).get("dayDate").asText()).isEqualTo("2026-06-04");

        // ручная позиция удалённого дня исчезла (FK CASCADE), trip-level осталась
        MvcResult list = mockMvc.perform(get("/api/v1/trips/" + tripId + "/manual-items")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode items = objectMapper.readTree(list.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("dayId").isNull()).isTrue();
    }

    @Test
    @Order(5)
    @DisplayName("MI-05: удаление своей позиции → 204, список пуст")
    void mi05_deleteItem() throws Exception {
        MvcResult created = addItem(userToken, tripId,
                "{\"ingredientId\":" + ingredientId + ",\"amount\":1}");
        Long itemId = readId(created);
        mockMvc.perform(delete("/api/v1/trips/" + tripId + "/manual-items/" + itemId)
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isNoContent());
        MvcResult list = mockMvc.perform(get("/api/v1/trips/" + tripId + "/manual-items")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(objectMapper.readTree(list.getResponse().getContentAsString(StandardCharsets.UTF_8))).isEmpty();
    }
}
