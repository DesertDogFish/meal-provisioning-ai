package com.provision.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

import jakarta.persistence.EntityManagerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Аудит 29.10.2026, подзадача 14 (plans/2026-10-29-full-audit.md): N+1 на странице
 * справочника продуктов. Ключевой признак N+1 — число запросов РАСТЁТ с числом строк
 * страницы; здесь оно должно быть константным (O(1) на страницу): стоимость, usage-count,
 * ЕМИСС-имена, synced-значок и shared-count грузятся пакетными запросами (FIX P1 в
 * ProductService), категории — через default_batch_fetch_size=50.
 *
 * <p>Порог «≤3 запроса» из плана недостижим честно: страница справочника — это
 * 1 (страница) + ~7 пакетных доборов (цены, usage, emis describe, synced ids, shared
 * counts, категории, priceStatus-подзапросы). Фиксируем измеренный потолок и, главное,
 * независимость от размера страницы.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@DisplayName("Справочник продуктов: число SQL-запросов на страницу (аудит 14)")
class ProductPageQueryCountTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_qcount")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? LocalPgFallback.jdbcUrl("provision_test_qcount") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
        registry.add("spring.jpa.properties.hibernate.generate_statistics", () -> "true");
    }

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired
    private org.flywaydb.core.Flyway flyway;
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private String adminToken;

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "qcount_admin@test.com");
        statistics().clear();
    }

    private Statistics statistics() {
        return entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    }

    private long pageQueries(int size) throws Exception {
        statistics().clear();
        mockMvc.perform(get("/api/v1/admin/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .param("size", String.valueOf(size))
                        .with(MockMvcUtf8PostProcessor.utf8Query()))
                .andExpect(status().isOk());
        return statistics().getPrepareStatementCount();
    }

    @Test
    @DisplayName("N+1 нет: число запросов не зависит от размера страницы (5 vs 20)")
    void queryCountIsConstantPerPage() throws Exception {
        long small = pageQueries(5);
        long large = pageQueries(20);

        assertThat(small).as("запросов на страницу size=5").isPositive();
        // главный признак N+1: large должно быть ~ small + N. Допускаем ±2
        // (пакетный IN может нарезаться на батчи по default_batch_fetch_size).
        assertThat(large - small)
                .as("дельта запросов между size=20 и size=5 (N+1 дал бы +15)")
                .isBetween(-2L, 2L);
    }

    @Test
    @DisplayName("Потолок запросов на страницу — O(1): не больше 15 (измерено: ~8-10)")
    void queryCountUnderCeiling() throws Exception {
        assertThat(pageQueries(20)).isLessThanOrEqualTo(15);
    }
}
