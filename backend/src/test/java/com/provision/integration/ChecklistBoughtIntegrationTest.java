package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.trip.ChecklistBoughtDtos;
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
import org.testcontainers.containers.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * KB-15: серверное хранение отметок "взято" в чеклисте похода.
 * V32: trip_checklist_bought (trip_id, ingredient_id, needed_stamp, created_by, created_at).
 *
 * CB-01: PUT 2 элементов -> 200, GET отдаёт их.
 * CB-02: повторный PUT полностью заменяет набор (идемпотентно).
 * CB-03: чужой поход -> 404 (GET и PUT).
 * CB-04: дубликаты пар в теле дедуплицируются.
 * CB-05: пустой items очищает набор.
 * CB-06: повторный PUT идентичного набора идемпотентен (200, ровно 2 элемента, без 500).
 * CB-07: неизвестный ingredientId -> 404 и откат (набор не изменился).
 * CB-08: без Authorization -> 401.
 * CB-09/CB-10: удаление похода/ингредиента каскадно чистит отметки.
 * CB-11: neededStamp = 0 валиден и сохраняется; < 0 и items > 2000 -> 400 без изменения набора.
 * CB-12: нулевой штамп не конфликтует с уникальным индексом при повторном PUT.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Checklist Bought Integration Tests (KB-15)")
class ChecklistBoughtIntegrationTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_cb")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? LocalPgFallback.jdbcUrl("provision_test_cb") : postgres.getJdbcUrl());
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
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "cb-user@test.com");
        otherToken = TestUsers.registerUser(mockMvc, objectMapper, "cb-other@test.com");
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "cb-admin@test.com");

        ingredientA = createIngredient("cb-a", "CB Гречка");
        ingredientB = createIngredient("cb-b", "CB Соль");

        MvcResult tripRes = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new TripRequest(
                                "CB Поход", LocalDate.now().plusDays(50), LocalDate.now().plusDays(52), 2, null))))
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

    private JsonNode putItems(List<ChecklistBoughtDtos.Item> items) throws Exception {
        MvcResult r = mockMvc.perform(put("/api/v1/trips/" + tripId + "/checklist-bought")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ChecklistBoughtDtos.ItemsBody(items))))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode getList() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/trips/" + tripId + "/checklist-bought")
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    @Order(1)
    @DisplayName("CB-01: PUT 2 элементов -> 200, GET отдаёт их")
    void cb01_putAndGet() throws Exception {
        JsonNode put = putItems(List.of(
                new ChecklistBoughtDtos.Item(ingredientA, 5000L),
                new ChecklistBoughtDtos.Item(ingredientB, 6000L)));
        assertThat(put).hasSize(2);

        JsonNode list = getList();
        assertThat(list).hasSize(2);
        boolean hasA = false, hasB = false;
        for (JsonNode n : list) {
            long id = n.get("ingredientId").asLong();
            if (id == ingredientA) { hasA = true; assertThat(n.get("neededStamp").asLong()).isEqualTo(5000L); }
            if (id == ingredientB) { hasB = true; assertThat(n.get("neededStamp").asLong()).isEqualTo(6000L); }
        }
        assertThat(hasA).isTrue();
        assertThat(hasB).isTrue();

        // Аудит-поле created_by должно быть заполнено актором (не NULL).
        Integer nullCreators = jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_bought WHERE trip_id = ? AND created_by IS NULL",
                Integer.class, tripId);
        assertThat(nullCreators).isZero();
    }

    @Test
    @Order(2)
    @DisplayName("CB-02: повторный PUT полностью заменяет набор")
    void cb02_replaceAll() throws Exception {
        putItems(List.of(
                new ChecklistBoughtDtos.Item(ingredientA, 5000L),
                new ChecklistBoughtDtos.Item(ingredientB, 6000L)));
        putItems(List.of(new ChecklistBoughtDtos.Item(ingredientB, 7000L)));

        JsonNode list = getList();
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("ingredientId").asLong()).isEqualTo(ingredientB);
        assertThat(list.get(0).get("neededStamp").asLong()).isEqualTo(7000L);
    }

    @Test
    @Order(3)
    @DisplayName("CB-03: чужой поход -> 404")
    void cb03_ownership() throws Exception {
        mockMvc.perform(get("/api/v1/trips/" + tripId + "/checklist-bought")
                        .header("Authorization", auth(otherToken)))
                .andExpect(status().isNotFound());
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/checklist-bought")
                        .header("Authorization", auth(otherToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"ingredientId\":" + ingredientA + ",\"neededStamp\":5000}]}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @Order(4)
    @DisplayName("CB-04: дубликаты (ingredientId, neededStamp) дедуплицируются")
    void cb04_dedup() throws Exception {
        JsonNode put = putItems(List.of(
                new ChecklistBoughtDtos.Item(ingredientA, 5000L),
                new ChecklistBoughtDtos.Item(ingredientA, 5000L),
                new ChecklistBoughtDtos.Item(ingredientB, 6000L)));
        assertThat(put).hasSize(2);
        assertThat(getList()).hasSize(2);
    }

    @Test
    @Order(5)
    @DisplayName("CB-05: пустой items очищает набор")
    void cb05_clear() throws Exception {
        putItems(List.of(new ChecklistBoughtDtos.Item(ingredientA, 5000L)));
        JsonNode put = putItems(List.of());
        assertThat(put).hasSize(0);
        assertThat(getList()).hasSize(0);
    }

    @Test
    @Order(6)
    @DisplayName("CB-06: повторный PUT идентичного набора идемпотентен (не 500 на unique-индексе)")
    void cb06_identicalRepeat() throws Exception {
        // Главный прод-сценарий: фронт шлёт полную замену на каждый чекбокс,
        // поэтому ОДИН И ТОТ ЖЕ набор прилетает многократно. Bulk-DELETE должен
        // уйти в БД до saveAll, иначе конфликт uq_tcb_trip_ingredient_stamp -> 500.
        List<ChecklistBoughtDtos.Item> same = List.of(
                new ChecklistBoughtDtos.Item(ingredientA, 5000L),
                new ChecklistBoughtDtos.Item(ingredientB, 6000L));

        JsonNode first = putItems(same);
        assertThat(first).hasSize(2);

        JsonNode second = putItems(same);
        assertThat(second).hasSize(2);

        JsonNode list = getList();
        assertThat(list).hasSize(2);
        boolean hasA = false, hasB = false;
        for (JsonNode n : list) {
            long id = n.get("ingredientId").asLong();
            if (id == ingredientA) { hasA = true; assertThat(n.get("neededStamp").asLong()).isEqualTo(5000L); }
            if (id == ingredientB) { hasB = true; assertThat(n.get("neededStamp").asLong()).isEqualTo(6000L); }
        }
        assertThat(hasA).isTrue();
        assertThat(hasB).isTrue();
    }

    @Test
    @Order(7)
    @DisplayName("CB-07: PUT с несуществующим ingredientId -> 404, набор не изменился (откат)")
    void cb07_unknownIngredientRollsBack() throws Exception {
        // Исходный набор из двух отметок.
        putItems(List.of(
                new ChecklistBoughtDtos.Item(ingredientA, 5000L),
                new ChecklistBoughtDtos.Item(ingredientB, 6000L)));

        long ghostId = 9_999_999L;
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/checklist-bought")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ChecklistBoughtDtos.ItemsBody(
                                List.of(new ChecklistBoughtDtos.Item(ghostId, 5000L))))))
                .andExpect(status().isNotFound());

        // Транзакция откатилась: старые строки на месте (bulk-DELETE не «залип»).
        JsonNode list = getList();
        assertThat(list).hasSize(2);
        boolean hasA = false, hasB = false;
        for (JsonNode n : list) {
            long id = n.get("ingredientId").asLong();
            if (id == ingredientA) { hasA = true; assertThat(n.get("neededStamp").asLong()).isEqualTo(5000L); }
            if (id == ingredientB) { hasB = true; assertThat(n.get("neededStamp").asLong()).isEqualTo(6000L); }
        }
        assertThat(hasA).isTrue();
        assertThat(hasB).isTrue();

        Integer rows = jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_bought WHERE trip_id = ?", Integer.class, tripId);
        assertThat(rows).isEqualTo(2);
    }

    @Test
    @Order(8)
    @DisplayName("CB-08: GET/PUT без Authorization -> 401")
    void cb08_requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/trips/" + tripId + "/checklist-bought"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(put("/api/v1/trips/" + tripId + "/checklist-bought")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"ingredientId\":" + ingredientA + ",\"neededStamp\":5000}]}"))
                .andExpect(status().isUnauthorized());

        Integer rows = jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_bought WHERE trip_id = ?", Integer.class, tripId);
        assertThat(rows).isZero();
    }

    @Test
    @Order(9)
    @DisplayName("CB-09: удаление похода каскадно удаляет отметки (ON DELETE CASCADE по trip_id)")
    void cb09_tripDeleteCascades() throws Exception {
        putItems(List.of(
                new ChecklistBoughtDtos.Item(ingredientA, 5000L),
                new ChecklistBoughtDtos.Item(ingredientB, 6000L)));

        mockMvc.perform(delete("/api/v1/trips/" + tripId)
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isNoContent());

        Integer left = jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_bought WHERE trip_id = ?", Integer.class, tripId);
        assertThat(left).isZero();
    }

    @Test
    @Order(10)
    @DisplayName("CB-10: удаление ингредиента с отметкой -> 204 (без FK-409), отметка удалена каскадом")
    void cb10_ingredientDeleteCascades() throws Exception {
        putItems(List.of(new ChecklistBoughtDtos.Item(ingredientA, 5000L)));

        // MAJOR из аудита: без ON DELETE CASCADE здесь был 409 «... email ...».
        mockMvc.perform(delete("/api/v1/admin/ingredients/" + ingredientA)
                        .header("Authorization", auth(adminToken)))
                .andExpect(status().isNoContent());

        Integer left = jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_bought WHERE ingredient_id = ?", Integer.class, ingredientA);
        assertThat(left).isZero();
        assertThat(getList()).hasSize(0);
    }

    @Test
    @Order(11)
    @DisplayName("CB-11: neededStamp = 0 валиден и сохраняется; neededStamp < 0 и items > 2000 -> 400 без изменения набора")
    void cb11_stampBoundsAndPayloadSize() throws Exception {
        String path = "/api/v1/trips/" + tripId + "/checklist-bought";

        // MAJOR аудита: 0 — ЛЕГИТИМНЫЙ штамп (позиция с нулевой потребностью:
        // checklistRowKey = round(needed*1000) = 0, специя < 0,5 г). С @Positive
        // такой PUT отклонялся всем набором (400), и клиент навсегда оставался
        // несинхронизированным.
        mockMvc.perform(put(path)
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"ingredientId\":" + ingredientA + ",\"neededStamp\":0}]}"))
                .andExpect(status().isOk());

        JsonNode afterZero = getList();
        assertThat(afterZero).hasSize(1);
        assertThat(afterZero.get(0).get("ingredientId").asLong()).isEqualTo(ingredientA);
        assertThat(afterZero.get(0).get("neededStamp").asLong()).isZero();
        Integer zeroRows = jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_bought WHERE trip_id = ? AND ingredient_id = ? AND needed_stamp = 0",
                Integer.class, tripId, ingredientA);
        assertThat(zeroRows).isEqualTo(1);

        // Отрицательный штамп — по-прежнему 400 (@PositiveOrZero, не отменяет нижнюю границу).
        mockMvc.perform(put(path)
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"ingredientId\":" + ingredientA + ",\"neededStamp\":-1}]}"))
                .andExpect(status().isBadRequest());

        // 400 на валидации не трогает набор: отметка со штампом 0 осталась.
        JsonNode afterNegative = getList();
        assertThat(afterNegative).hasSize(1);
        assertThat(afterNegative.get(0).get("neededStamp").asLong()).isZero();

        // Защита от раздутого payload: > 2000 items -> 400 (@Size(max = 2000)).
        StringBuilder tooMany = new StringBuilder("{\"items\":[");
        for (int i = 0; i < 2001; i++) {
            if (i > 0) tooMany.append(',');
            tooMany.append("{\"ingredientId\":").append(ingredientA)
                    .append(",\"neededStamp\":").append(5000 + i).append('}');
        }
        tooMany.append("]}");
        mockMvc.perform(put(path)
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tooMany.toString()))
                .andExpect(status().isBadRequest());

        // Набор по-прежнему не изменился (ни один из 2001 элемента не записан).
        JsonNode afterTooMany = getList();
        assertThat(afterTooMany).hasSize(1);
        assertThat(afterTooMany.get(0).get("ingredientId").asLong()).isEqualTo(ingredientA);
        assertThat(afterTooMany.get(0).get("neededStamp").asLong()).isZero();
        Integer rows = jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_bought WHERE trip_id = ?", Integer.class, tripId);
        assertThat(rows).isEqualTo(1);
    }

    @Test
    @Order(12)
    @DisplayName("CB-12: нулевой штамп не конфликтует с uq_tcb_trip_ingredient_stamp при повторном PUT (в БД одна строка)")
    void cb12_zeroStampRepeatPut() throws Exception {
        List<ChecklistBoughtDtos.Item> zeroSet = List.of(new ChecklistBoughtDtos.Item(ingredientA, 0L));

        // Повторный PUT того же набора: bulk-DELETE должен уйти в БД до saveAll,
        // иначе needed_stamp = 0 (не NULL!) даёт конфликт уникального индекса -> 500.
        JsonNode first = putItems(zeroSet);
        assertThat(first).hasSize(1);
        assertThat(first.get(0).get("neededStamp").asLong()).isZero();

        JsonNode second = putItems(zeroSet);
        assertThat(second).hasSize(1);
        assertThat(second.get(0).get("ingredientId").asLong()).isEqualTo(ingredientA);
        assertThat(second.get(0).get("neededStamp").asLong()).isZero();

        JsonNode list = getList();
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("ingredientId").asLong()).isEqualTo(ingredientA);
        assertThat(list.get(0).get("neededStamp").asLong()).isZero();

        Integer rows = jdbc.queryForObject(
                "SELECT count(*) FROM trip_checklist_bought WHERE trip_id = ? AND ingredient_id = ?",
                Integer.class, tripId, ingredientA);
        assertThat(rows).isEqualTo(1);

        Integer duplicates = jdbc.queryForObject(
                "SELECT count(*) FROM (SELECT ingredient_id, needed_stamp"
                        + " FROM trip_checklist_bought WHERE trip_id = ?"
                        + " GROUP BY ingredient_id, needed_stamp HAVING count(*) > 1) d",
                Integer.class, tripId);
        assertThat(duplicates).isZero();
    }
}
