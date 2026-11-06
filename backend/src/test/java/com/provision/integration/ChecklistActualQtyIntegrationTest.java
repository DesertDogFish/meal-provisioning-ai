package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.trip.ChecklistActualQtyDtos;
import com.provision.dto.trip.TripRequest;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * BL-27: серверное хранение ФАКТИЧЕСКОГО количества чеклиста похода.
 * V37: trip_checklist_actual_qty (trip_id, ingredient_id, amount, unit, created_by, created_at).
 *
 * CA-01: PUT 2 элементов -> 200, GET отдаёт их.
 * CA-02: повторный PUT полностью заменяет набор (идемпотентно).
 * CA-03: чужой поход -> 404 (GET и PUT).
 * CA-04: дубликаты ingredientId в теле схлопываются (последнее значение выигрывает).
 * CA-05: пустой items очищает набор.
 * CA-06: повторный PUT идентичного набора идемпотентен (200, ровно 2 элемента, без 500).
 * CA-07: неизвестный ingredientId -> 404 и откат (набор не изменился).
 * CA-08: без Authorization -> 401.
 * CA-09: amount <= 0 / пустой unit / unit > 16 -> 400 без изменения набора.
 * CA-10: удаление похода каскадно чистит факты (FK ON DELETE CASCADE).
 * CA-11: unit сохраняется как есть после trim, amount — с точностью до 3 знаков.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Checklist Actual Qty Integration Tests (BL-27)")
class ChecklistActualQtyIntegrationTest {

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> SharedPostgres.jdbcUrl("provision_test_caq"));
        registry.add("spring.datasource.username", SharedPostgres::username);
        registry.add("spring.datasource.password", SharedPostgres::password);
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
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "caq-user@test.com");
        otherToken = TestUsers.registerUser(mockMvc, objectMapper, "caq-other@test.com");
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "caq-admin@test.com");

        ingredientA = createIngredient("caq-a", "CAQ Гречка");
        ingredientB = createIngredient("caq-b", "CAQ Соль");

        MvcResult tripRes = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new TripRequest(
                                "CAQ Поход", LocalDate.now().plusDays(50), LocalDate.now().plusDays(52), 2, null))))
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

    private ChecklistActualQtyDtos.Item item(Long ingredientId, String amount, String unit) {
        return new ChecklistActualQtyDtos.Item(ingredientId, new BigDecimal(amount), unit);
    }

    private JsonNode putItems(List<ChecklistActualQtyDtos.Item> items) throws Exception {
        MvcResult r = mockMvc.perform(put("/api/v1/trips/" + tripId + "/checklist-actual-qty")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ChecklistActualQtyDtos.ItemsBody(items))))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode getList() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/trips/" + tripId + "/checklist-actual-qty")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    @Order(1)
    @DisplayName("CA-01: PUT двух фактов -> 200, GET отдаёт ту же форму")
    void ca01_putAndGet() throws Exception {
        JsonNode saved = putItems(List.of(item(ingredientA, "300", "г"), item(ingredientB, "2", "кг")));

        assertThat(saved.isArray()).isTrue();
        assertThat(saved).hasSize(2);
        assertThat(saved.get(0).get("ingredientId").asLong()).isEqualTo(ingredientA);
        assertThat(saved.get(0).get("amount").decimalValue()).isEqualByComparingTo("300");
        assertThat(saved.get(0).get("unit").asText()).isEqualTo("г");

        JsonNode listed = getList();
        assertThat(listed).hasSize(2);
        assertThat(listed.get(1).get("ingredientId").asLong()).isEqualTo(ingredientB);
    }

    @Test
    @Order(2)
    @DisplayName("CA-02: повторный PUT полностью заменяет набор (не дополняет)")
    void ca02_replaceNotMerge() throws Exception {
        putItems(List.of(item(ingredientA, "300", "г")));
        putItems(List.of(item(ingredientB, "5", "шт")));

        JsonNode listed = getList();
        assertThat(listed).hasSize(1);
        assertThat(listed.get(0).get("ingredientId").asLong()).isEqualTo(ingredientB);
        assertThat(listed.get(0).get("unit").asText()).isEqualTo("шт");
    }

    @Test
    @Order(3)
    @DisplayName("CA-03: чужой поход -> 404 (GET и PUT), набор владельца не тронут")
    void ca03_foreignTripNotFound() throws Exception {
        putItems(List.of(item(ingredientA, "300", "г")));

        mockMvc.perform(get("/api/v1/trips/" + tripId + "/checklist-actual-qty")
                        .header("Authorization", auth(otherToken)))
                .andExpect(status().isNotFound());

        mockMvc.perform(put("/api/v1/trips/" + tripId + "/checklist-actual-qty")
                        .header("Authorization", auth(otherToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new ChecklistActualQtyDtos.ItemsBody(List.of(item(ingredientB, "1", "кг"))))))
                .andExpect(status().isNotFound());

        assertThat(getList()).hasSize(1);
    }

    @Test
    @Order(4)
    @DisplayName("CA-04: дубли ingredientId схлопываются, последнее значение выигрывает")
    void ca04_duplicatesCollapse() throws Exception {
        putItems(List.of(item(ingredientA, "300", "г"), item(ingredientA, "500", "г")));

        JsonNode listed = getList();
        assertThat(listed).hasSize(1);
        assertThat(listed.get(0).get("amount").decimalValue()).isEqualByComparingTo("500");
    }

    @Test
    @Order(5)
    @DisplayName("CA-05: пустой items очищает набор")
    void ca05_emptyClears() throws Exception {
        putItems(List.of(item(ingredientA, "300", "г")));
        JsonNode saved = putItems(List.of());

        assertThat(saved).isEmpty();
        assertThat(getList()).isEmpty();
    }

    @Test
    @Order(6)
    @DisplayName("CA-06: повторный PUT идентичного набора идемпотентен (без 500 на уникальном индексе)")
    void ca06_identicalRepeat() throws Exception {
        List<ChecklistActualQtyDtos.Item> same = List.of(
                item(ingredientA, "300", "г"),
                item(ingredientB, "2", "кг"));

        putItems(same);
        JsonNode second = putItems(same);

        assertThat(second).hasSize(2);
        assertThat(getList()).hasSize(2);
    }

    @Test
    @Order(7)
    @DisplayName("CA-07: неизвестный ingredientId -> 404 и откат (набор не изменился)")
    void ca07_unknownIngredientRollsBack() throws Exception {
        putItems(List.of(item(ingredientA, "300", "г")));

        mockMvc.perform(put("/api/v1/trips/" + tripId + "/checklist-actual-qty")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ChecklistActualQtyDtos.ItemsBody(List.of(
                                item(ingredientA, "300", "г"),
                                item(999999L, "1", "кг"))))))
                .andExpect(status().isNotFound());

        JsonNode listed = getList();
        assertThat(listed).hasSize(1);
        assertThat(listed.get(0).get("ingredientId").asLong()).isEqualTo(ingredientA);
    }

    @Test
    @Order(8)
    @DisplayName("CA-08: без Authorization -> 401")
    void ca08_unauthorized() throws Exception {
        mockMvc.perform(get("/api/v1/trips/" + tripId + "/checklist-actual-qty"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Order(9)
    @DisplayName("CA-09: amount <= 0 / пустой unit / unit > 16 -> 400 без изменения набора")
    void ca09_validation() throws Exception {
        putItems(List.of(item(ingredientA, "300", "г")));

        for (String body : List.of(
                "{\"items\":[{\"ingredientId\":" + ingredientB + ",\"amount\":0,\"unit\":\"г\"}]}",
                "{\"items\":[{\"ingredientId\":" + ingredientB + ",\"amount\":-1,\"unit\":\"г\"}]}",
                "{\"items\":[{\"ingredientId\":" + ingredientB + ",\"amount\":1,\"unit\":\"  \"}]}",
                "{\"items\":[{\"ingredientId\":" + ingredientB + ",\"amount\":1,\"unit\":\"12345678901234567\"}]}")) {
            mockMvc.perform(put("/api/v1/trips/" + tripId + "/checklist-actual-qty")
                            .header("Authorization", auth(userToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest());
        }

        JsonNode listed = getList();
        assertThat(listed).hasSize(1);
        assertThat(listed.get(0).get("ingredientId").asLong()).isEqualTo(ingredientA);
    }

    @Test
    @Order(10)
    @DisplayName("CA-11: unit сохраняется после trim, amount — точность 3 знака")
    void ca11_unitsAndPrecision() throws Exception {
        JsonNode saved = putItems(List.of(item(ingredientA, "2.375", " кг ")));

        assertThat(saved.get(0).get("unit").asText()).isEqualTo("кг");
        assertThat(saved.get(0).get("amount").decimalValue()).isEqualByComparingTo("2.375");
    }

    @Test
    @Order(11)
    @DisplayName("CA-10: удаление похода каскадно чистит факты")
    void ca10_cascadeOnTripDelete() throws Exception {
        putItems(List.of(item(ingredientA, "300", "г")));
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_actual_qty WHERE trip_id = ?", Long.class, tripId)).isEqualTo(1);

        mockMvc.perform(delete("/api/v1/trips/" + tripId)
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_actual_qty WHERE trip_id = ?", Long.class, tripId)).isEqualTo(0);
    }
}
