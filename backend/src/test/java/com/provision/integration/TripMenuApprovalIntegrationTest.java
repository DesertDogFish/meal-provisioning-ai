package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.entity.Trip;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * trip-workflow-redesign п.2: утверждение меню похода ①.
 *
 * MA-01: GET /trips/{id} несёт menuApproved=false на новом походе;
 *        POST /{id}/menu-approval — toggle: 200 true → 200 false; GET согласован.
 * MA-02: ownership — чужой поход → 404 (не 403, как прочие мутации похода).
 * MA-03: оптимистичная блокировка: устаревшая транзакция, конкурентно изменившая
 *        trip после загрузки, получает ObjectOptimisticLockingFailureException
 *        (GlobalExceptionHandler маппит в 409 CONCURRENT_MODIFICATION).
 *
 * Песочница без Docker — LocalPgFallback (pg :5433); в CI — testcontainers.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Trip Menu Approval Integration Tests (redesign п.2)")
class TripMenuApprovalIntegrationTest {

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> SharedPostgres.jdbcUrl("provision_test_menu_approval"));
        registry.add("spring.datasource.username", SharedPostgres::username);
        registry.add("spring.datasource.password", SharedPostgres::password);
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private org.flywaydb.core.Flyway flyway;
    @Autowired private PlatformTransactionManager txManager;
    @Autowired private EntityManager entityManager;

    private String userToken;
    private String otherToken;
    private Long tripId;

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "ma-user@test.com");
        otherToken = TestUsers.registerUser(mockMvc, objectMapper, "ma-other@test.com");

        MvcResult trip = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Поход MA\",\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-02\",\"defaultPeople\":2}"))
                .andExpect(status().isCreated())
                .andReturn();
        tripId = objectMapper.readTree(trip.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asLong();
    }

    private String auth(String token) {
        return "Bearer " + token;
    }

    private boolean menuApprovedGet() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/trips/" + tripId)
                        .header("Authorization", auth(userToken)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode json = objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(json.has("menuApproved")).as("контракт TripResponse содержит menuApproved").isTrue();
        return json.get("menuApproved").asBoolean();
    }

    private boolean menuApprovedPost(String token) throws Exception {
        MvcResult r = mockMvc.perform(post("/api/v1/trips/" + tripId + "/menu-approval")
                        .header("Authorization", auth(token)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("menuApproved").asBoolean();
    }

    @Test
    @Order(1)
    @DisplayName("MA-01: toggle утверждения меню — false → true → false, GET согласован")
    void ma01_toggle() throws Exception {
        assertThat(menuApprovedGet()).isFalse();
        assertThat(menuApprovedPost(userToken)).isTrue();
        assertThat(menuApprovedGet()).isTrue();
        assertThat(menuApprovedPost(userToken)).isFalse();
        assertThat(menuApprovedGet()).isFalse();
    }

    @Test
    @Order(2)
    @DisplayName("MA-02: чужой поход — 404, утверждение не меняется")
    void ma02_foreignTrip404() throws Exception {
        mockMvc.perform(post("/api/v1/trips/" + tripId + "/menu-approval")
                        .header("Authorization", auth(otherToken)))
                .andExpect(status().isNotFound());
        assertThat(menuApprovedGet()).isFalse();
    }

    @Test
    @Order(3)
    @DisplayName("MA-03: устаревшая транзакция — конфликт оптимистичной блокировки")
    void ma03_staleTransactionConflicts() throws Exception {
        TransactionTemplate tx = new TransactionTemplate(txManager);
        CountDownLatch loaded = new CountDownLatch(1);
        CountDownLatch proceed = new CountDownLatch(1);
        AtomicReference<Throwable> staleFailure = new AtomicReference<>();

        Future<?> stale = Executors.newSingleThreadExecutor().submit(() -> {
            try {
                tx.executeWithoutResult(status -> {
                    Trip trip = entityManager.find(Trip.class, tripId);
                    assertThat(trip).isNotNull();
                    loaded.countDown();
                    try {
                        proceed.await(15, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    // конкурент уже закоммитил свою правку — коммит этой транзакции
                    // обязан упасть конфликтом @Version (JpaTransactionManager маппит
                    // в ObjectOptimisticLockingFailureException; поле не важно —
                    // версия поднимается любой мутацией строки)
                    trip.setNotes("stale-tx");
                });
            } catch (Throwable t) {
                staleFailure.set(t);
            }
        });

        assertThat(loaded.await(15, TimeUnit.SECONDS)).as("транзакция A успела загрузить поход").isTrue();
        assertThat(menuApprovedPost(userToken)).isTrue(); // конкурент коммитит версию N+1
        proceed.countDown();
        stale.get(20, TimeUnit.SECONDS);

        assertThat(staleFailure.get())
                .as("устаревшая транзакция отклонена оптимистичной блокировкой")
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);
    }
}
