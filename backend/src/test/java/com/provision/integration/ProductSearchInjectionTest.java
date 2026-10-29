package com.provision.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Аудит 29.10.2026, подзадачи 20/30 (plans/2026-10-29-full-audit.md): поиск по справочнику
 * продуктов не подвержен SQL-injection (все предикаты параметризованы) и экранирует
 * LIKE-wildcards («%» и «_» ищутся буквально), а page/size зажаты в sane-диапазон.
 *
 * <p>Слой — интеграционный (R2): проверяется поведение реального SQL-пути
 * (Specification → Hibernate → PostgreSQL), а не юнит-логика экранирования.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@DisplayName("Поиск продуктов: injection-устойчивость и экранирование wildcards (аудит 20/30)")
class ProductSearchInjectionTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_inj")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? LocalPgFallback.jdbcUrl("provision_test_inj") : postgres.getJdbcUrl());
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
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "inj_admin@test.com");
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> search(String rawQuery) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/admin/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("query", rawQuery)
                        .with(MockMvcUtf8PostProcessor.utf8Query()))
                .andExpect(status().isOk())
                .andReturn();
        Map<String, Object> page = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8), Map.class);
        return (List<Map<String, Object>>) page.get("content");
    }

    @Test
    @DisplayName("INJ-01: SQL-injection в query — 200, пустая выдача, таблица ingredients цела")
    void injectionAttemptIsInert() throws Exception {
        List<Map<String, Object>> content = search("'; DROP TABLE ingredients; --");
        assertThat(content).isEmpty();

        Integer alive = jdbc.queryForObject("SELECT count(*) FROM ingredients", Integer.class);
        assertThat(alive).isNotNull().isPositive();

        // вторая попытка («OR 1=1») тоже не выводит весь каталог
        assertThat(search("' OR '1'='1")).isEmpty();
    }

    @Test
    @DisplayName("INJ-02: «%» ищет буквально — только продукты с символом % в имени, не весь каталог")
    void percentWildcardEscaped() throws Exception {
        List<Map<String, Object>> content = search("%");
        // экранирование работает: НЕ весь каталог, а только буквальное вхождение «%»
        // (в сиде такие есть: «Уксус 9% 100 мл», «Молоко ... 2,5% 1 л»)
        assertThat(content).isNotEmpty();
        assertThat(content).allSatisfy(p ->
                assertThat(String.valueOf(p.get("name"))).contains("%"));
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM ingredients WHERE trip_id IS NULL", Integer.class);
        assertThat(content.size()).isLessThan(total);
        assertThat(search("100%")).isEmpty();
        // контроль: обычный поиск работает. Цели выбираем СТРУКТУРНО (§15 тест-гигиены —
        // не завязываться на точные имена сида): подстрока имени первого продукта выдачи.
        assertThat(search("buckwheat")).isNotEmpty(); // код — стабилен между сидами
        List<Map<String, Object>> firstPage = search("");
        assertThat(firstPage).isNotEmpty();
        String firstName = String.valueOf(firstPage.get(0).get("name"));
        String fragment = firstName.substring(0, Math.min(5, firstName.length()));
        assertThat(search(fragment)).isNotEmpty();
    }

    @Test
    @DisplayName("INJ-03: «_» матчит только литеральный underscore в имени ИЛИ коде (SQL-сверка)")
    void underscoreWildcardEscaped() throws Exception {
        List<Map<String, Object>> content = search("_");
        assertThat(content).isNotEmpty(); // коды сида вида beef_stew содержат «_»
        for (Map<String, Object> p : content) {
            // JacksonConfig сериализует Long-id строками (контракт фронта)
            long id = Long.parseLong(String.valueOf(p.get("id")));
            Integer matches = jdbc.queryForObject(
                    "SELECT count(*) FROM ingredients WHERE id = ? "
                            + "AND (name LIKE '%!_%' ESCAPE '!' OR code LIKE '%!_%' ESCAPE '!')",
                    Integer.class, id);
            assertThat(matches).as("продукт id=%d содержит литеральный '_'", id).isEqualTo(1);
        }
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM ingredients WHERE trip_id IS NULL", Integer.class);
        assertThat(content.size()).isLessThan(total);
    }

    @Test
    @DisplayName("INJ-04: size=1000000 зажимается до 200 (защита от memory/DB abuse)")
    void pageSizeClamped() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/admin/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("size", "1000000")
                        .with(MockMvcUtf8PostProcessor.utf8Query()))
                .andExpect(status().isOk())
                .andReturn();
        Map<String, Object> page = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8), Map.class);
        assertThat(((Number) page.get("size")).intValue()).isLessThanOrEqualTo(200);
        assertThat((List<?>) page.get("content")).hasSizeLessThanOrEqualTo(200);
    }
}
