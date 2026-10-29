package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * KB-8 / BL-23: счётчик «сколько ещё продуктов привязано к той же позиции ЕМИСС»
 * ({@code ProductResponse.emisSharedCount}) — он питает значок со счётчиком в таблице продуктов.
 *
 * <p>Проверяется на реальной БД и настоящем HTTP-контракте: считаются только ГЛОБАЛЬНЫЕ
 * продукты ({@code trip_id IS NULL}), снепшоты походов не учитываются — история похода
 * неизменна и не должна влиять на значок в каталоге.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@DisplayName("emisSharedCount: счётчик общей привязки к позиции ЕМИСС")
class EmisSharedCountIntegrationTest {

    /** Docker есть -> Testcontainers; нет -> локальный PG-fallback (LocalPgFallback). */
    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_emis_shared")
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
                ? LocalPgFallback.jdbcUrl("provision_test_emis_shared") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Autowired
    private org.flywaydb.core.Flyway flyway;

    private String adminToken;

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "emis_shared@test.com");
    }

    // ==================== помощники ====================

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder b) {
        return b.header("Authorization", "Bearer " + adminToken)
                .with(MockMvcUtf8PostProcessor.utf8Query());
    }

    private long firstCategoryId() {
        Long id = jdbc.queryForObject("SELECT id FROM product_categories ORDER BY id LIMIT 1", Long.class);
        return id == null ? 1L : id;
    }

    /**
     * Реальный код позиции из локальной копии (сид V27), которую ещё не занял ни один глобальный
     * продукт. Тест обязан быть независимым от сида привязок (V26–V29 связали с ЕМИСС ~190
     * продуктов), поэтому берём свободную позицию: счётчик начинается с 0 и любое изменение видно.
     */
    private String freeEmisCode(String nameLike) {
        String code = jdbc.queryForObject("""
                SELECT p.code FROM emis_products p
                 WHERE lower(p.name) LIKE lower(?)
                   AND NOT EXISTS (SELECT 1 FROM ingredients i
                                    WHERE i.emis_code = p.code AND i.trip_id IS NULL)
                 ORDER BY p.code LIMIT 1
                """, String.class, "%" + nameLike + "%");
        assertThat(code).as("в локальной копии есть свободная позиция «%s»", nameLike).isNotBlank();
        return code;
    }

    private long createProduct(String name, String unit, String emisCode) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("categoryId", firstCategoryId());
        body.put("unit", unit);
        body.put("emisCode", emisCode); // null — продукт не привязан
        String json = objectMapper.writeValueAsString(body);

        String response = mockMvc.perform(auth(post("/api/v1/admin/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(response).get("id").asLong();
    }

    private void bindProduct(long id, String name, String unit, String emisCode) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("categoryId", firstCategoryId());
        body.put("unit", unit);
        body.put("emisCode", emisCode);
        mockMvc.perform(auth(put("/api/v1/admin/products/" + id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body).getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isOk());
    }

    /** {@code emisSharedCount} продукта из настоящего ответа списка (контракт JSON). */
    private Integer sharedCountOf(long productId) throws Exception {
        String response = mockMvc.perform(auth(get("/api/v1/admin/products")
                        .param("size", "200").param("sort", "name").param("direction", "asc")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode content = objectMapper.readTree(response).get("content");
        for (JsonNode row : content) {
            if (row.get("id").asLong() == productId) {
                JsonNode field = row.get("emisSharedCount");
                return field == null || field.isNull() ? null : field.asInt();
            }
        }
        throw new AssertionError("продукт " + productId + " не найден в списке");
    }

    // ==================== тесты ====================

    @Test
    @DisplayName("Два глобальных продукта на одном коде → у каждого emisSharedCount = 1")
    void twoProductsOnSameCodeSeeEachOther() throws Exception {
        String position = freeEmisCode("фарш мясной");
        long a = createProduct("Фарш домашний (тест А)", "KG", position);
        long b = createProduct("Фарш магазинный (тест Б)", "KG", position);

        assertThat(sharedCountOf(a)).isEqualTo(1);
        assertThat(sharedCountOf(b)).isEqualTo(1);
    }

    @Test
    @DisplayName("Три продукта на одном коде → у каждого 2; разные коды считаются раздельно")
    void countsPerCode() throws Exception {
        String position = freeEmisCode("фарш мясной");
        String other = freeEmisCode("маргарин");
        long a = createProduct("Счётчик А", "KG", position);
        long b = createProduct("Счётчик Б", "KG", position);
        long c = createProduct("Счётчик В", "KG", position);
        long d = createProduct("Счётчик Г", "PCS", other);

        assertThat(sharedCountOf(a)).isEqualTo(2);
        assertThat(sharedCountOf(b)).isEqualTo(2);
        assertThat(sharedCountOf(c)).isEqualTo(2);
        assertThat(sharedCountOf(d)).isEqualTo(0);
    }

    @Test
    @DisplayName("Отвязка соседа обнуляет счётчик (значок в таблице гаснет)")
    void unbindingDropsCounter() throws Exception {
        String position = freeEmisCode("фарш мясной");
        long a = createProduct("Остаётся привязанным", "KG", position);
        long b = createProduct("Отвязывается", "KG", position);
        assertThat(sharedCountOf(a)).isEqualTo(1);

        bindProduct(b, "Отвязывается", "KG", null);

        assertThat(sharedCountOf(a)).isZero();
        assertThat(sharedCountOf(b)).isZero();
    }

    @Test
    @DisplayName("Непривязанный продукт: emisSharedCount = 0 (поле есть, не null)")
    void unboundProductReportsZero() throws Exception {
        long id = createProduct("Без источника цены", "KG", null);

        assertThat(sharedCountOf(id)).isZero();
    }

    @Test
    @DisplayName("Снепшот похода с тем же кодом НЕ считается: история похода неизменна")
    void tripSnapshotsAreNotCounted() throws Exception {
        String position = freeEmisCode("фарш мясной");
        long global = createProduct("Глобальный продукт", "KG", position);

        // Снепшот похода: та же позиция ЕМИСС, но trip_id задан (копия продукта в походе).
        Long userId = jdbc.queryForObject("SELECT id FROM users WHERE email = 'emis_shared@test.com'", Long.class);
        Long tripId = jdbc.queryForObject("""
                INSERT INTO trips (user_id, name, start_date, end_date, default_people, created_at, updated_at)
                VALUES (?, 'Тестовый поход', DATE '2026-08-01', DATE '2026-08-03', 2, now(), now())
                RETURNING id
                """, Long.class, userId);
        jdbc.update("""
                INSERT INTO ingredients (name, unit, category_id, name_norm, trip_id, snapshot_of, emis_code,
                                         created_at, updated_at)
                VALUES ('Глобальный продукт', 'KG', ?, 'глобальный продукт', ?, ?, ?, now(), now())
                """, firstCategoryId(), tripId, global, position);

        assertThat(sharedCountOf(global)).isZero();
        // И сам снепшот в список продуктов не попадает (trip_id IS NULL в выборке каталога).
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM ingredients WHERE emis_code = ? AND trip_id IS NULL",
                Integer.class, position)).isEqualTo(1);
    }
}
