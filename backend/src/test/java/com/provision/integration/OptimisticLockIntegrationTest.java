package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.recipe.RecipeRequest;
import com.provision.dto.trip.MealCompositionDtos.CompositionPutRequest;
import com.provision.dto.trip.TripMealRequest;
import com.provision.dto.trip.TripRequest;
import com.provision.entity.MealType;
import com.provision.entity.TripMeal;
import com.provision.service.MealCompositionService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * BL-41 / AU-13: оптимистичные блокировки (@Version) на изменяемых агрегатах похода.
 *
 * <p>Карточка задачи требует: «вторая конкурентная запись получает 409, а не молча
 * перезаписывает; тест по R1 на конкурентный batch-PUT». Проверяем две вещи:</p>
 *
 * <p><b>OL-01</b> — атомарный batch-PUT состава поднимает версию агрегата
 * ({@code trip_meals.version}). Без {@code OPTIMISTIC_FORCE_INCREMENT} в
 * {@link MealCompositionService#putComposition} правки состава живут только в
 * {@code trip_ingredient_substitutions}, поэтому ни одна версионированная строка
 * не менялась и конфликт было невозможно поймать (red→green).</p>
 *
 * <p><b>OL-02</b> — устаревшая транзакция не затирает чужие правки: транзакция A
 * загружает приём (версия N), конкурентная транзакция B коммитит свой batch-PUT
 * (версия N+1), затем A пытается записать свой состав — коммит обязан упасть
 * {@code OptimisticLockingFailureException} (тот самый 409 CONCURRENT_MODIFICATION,
 * который GlobalExceptionHandler отдаёт клиенту), а данные B остаться в БД.</p>
 *
 * <p>Почему не HTTP-пара с двумя одновременными запросами: MockMvc исполняется в
 * вызывающем потоке, и гарантировать перекрытие двух транзакций без точки паузы
 * нельзя — тест стал бы плавающим. Пауза здесь детерминирована латчом, а путь
 * кода — тот же сервис, что и за эндпоинтом. Маппинг 409 проверен отдельно в
 * {@code GlobalExceptionHandlerErrorCodeTest}.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Optimistic Lock Integration Tests (BL-41 / AU-13)")
class OptimisticLockIntegrationTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_olock")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? LocalPgFallback.jdbcUrl("provision_test_olock") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private org.flywaydb.core.Flyway flyway;
    @Autowired private PlatformTransactionManager txManager;
    @Autowired private EntityManager entityManager;
    @Autowired private MealCompositionService compositionService;

    private String userToken;
    private Long userId;
    private Long tripId;
    private Long mealId;
    private Long ingredientId;

    private String auth(String t) { return "Bearer " + t; }

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "olock-user@test.com");
        String adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "olock-admin@test.com");
        userId = jdbc.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, "olock-user@test.com");

        ingredientId = createIngredient(adminToken);
        Long recipeId = createRecipe(adminToken);
        tripId = createTrip();

        MvcResult meal = mockMvc.perform(post("/api/v1/trips/" + tripId + "/days/" + dayId() + "/meals")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new TripMealRequest(MealType.LUNCH, recipeId, null, 1))))
                .andExpect(status().isCreated())
                .andReturn();
        mealId = objectMapper.readTree(meal.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("id").asLong();
    }

    private Long createIngredient(String adminToken) throws Exception {
        MvcResult r = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", auth(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"olock-a\",\"name\":\"OL Гречка\",\"unit\":\"KG\",\"category\":\"Зерновые\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("id").asLong();
    }

    private Long createRecipe(String adminToken) throws Exception {
        RecipeRequest request = new RecipeRequest(
                "OL Каша", MealType.LUNCH, "Каши", 10, 2, null,
                List.of(new RecipeRequest.RecipeIngredientItem(ingredientId, new BigDecimal("100"))));
        MvcResult r = mockMvc.perform(post("/api/v1/admin/recipes")
                        .header("Authorization", auth(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("id").asLong();
    }

    private Long createTrip() throws Exception {
        MvcResult r = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new TripRequest(
                                "OL Поход", LocalDate.now().plusDays(40), LocalDate.now().plusDays(42), 2, null))))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode trip = objectMapper.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
        return trip.get("id").asLong();
    }

    private Long dayId() {
        return jdbc.queryForObject(
                "SELECT id FROM trip_days WHERE trip_id = ? ORDER BY day_date LIMIT 1", Long.class, tripId);
    }

    private long mealVersion() {
        Long v = jdbc.queryForObject("SELECT version FROM trip_meals WHERE id = ?", Long.class, mealId);
        return v == null ? -1 : v;
    }

    private int substitutionCount() {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM trip_ingredient_substitutions WHERE trip_id = ?", Integer.class, tripId);
        return n == null ? 0 : n;
    }

    /** batch-PUT: одна SCALED-правка состава (правка «замена на себя» с ratio). */
    private CompositionPutRequest scaledRequest() {
        return new CompositionPutRequest(
                List.of(new CompositionPutRequest.ItemDto(ingredientId, "SCALED", null, new BigDecimal("2"))),
                null);
    }

    @Test
    @Order(1)
    @DisplayName("OL-01: batch-PUT состава поднимает version агрегата приёма")
    void ol01_batchPutBumpsVersion() throws Exception {
        long before = mealVersion();
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/meals/" + mealId + "/composition")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(scaledRequest())))
                .andExpect(status().isOk());
        long after = mealVersion();
        assertThat(after)
                .as("OPTIMISTIC_FORCE_INCREMENT обязан поднять version trip_meals: %s -> %s", before, after)
                .isGreaterThan(before);
    }

    @Test
    @Order(2)
    @DisplayName("OL-02: устаревшая транзакция получает конфликт, данные конкурента не затёрты")
    void ol02_staleTransactionConflicts() throws Exception {
        TransactionTemplate tx = new TransactionTemplate(txManager);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        CountDownLatch loaded = new CountDownLatch(1);
        CountDownLatch proceed = new CountDownLatch(1);
        AtomicReference<Throwable> staleFailure = new AtomicReference<>();

        Future<?> stale = pool.submit(() -> {
            try {
                tx.executeWithoutResult(status -> {
                    // A: загрузить приём в СВОЕЙ транзакции (версия N) и замереть.
                    TripMeal meal = entityManager.find(TripMeal.class, mealId);
                    assertThat(meal).isNotNull();
                    loaded.countDown();
                    try {
                        proceed.await(15, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    // B уже закоммитил более новую версию — эта правка обязана упасть.
                    compositionService.putComposition(tripId, mealId, scaledRequest(), userId);
                });
            } catch (Throwable t) {
                staleFailure.set(t);
            }
        });

        assertThat(loaded.await(15, TimeUnit.SECONDS)).as("транзакция A успела загрузить приём").isTrue();

        // B: конкурентный batch-PUT в ОТДЕЛЬНОЙ транзакции (MockMvc → своя tx).
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/meals/" + mealId + "/composition")
                        .header("Authorization", auth(userToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(scaledRequest())))
                .andExpect(status().isOk());

        proceed.countDown();
        stale.get(20, TimeUnit.SECONDS);
        pool.shutdownNow();

        assertThat(staleFailure.get())
                .as("вторая конкурентная запись обязана получить OptimisticLockingFailureException")
                .isNotNull();
        assertThat(hasOptimisticLockCause(staleFailure.get()))
                .as("причина конфликта — оптимистичная блокировка, а не что-то иное: %s", staleFailure.get())
                .isTrue();

        // Данные победителя на месте: проигравшая транзакция не применилась.
        assertThat(substitutionCount())
                .as("правка конкурента не затёрта откатившейся записью")
                .isEqualTo(1);
    }

    private static boolean hasOptimisticLockCause(Throwable t) {
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            if (cur instanceof org.springframework.dao.OptimisticLockingFailureException
                    || cur instanceof jakarta.persistence.OptimisticLockException) {
                return true;
            }
            if (cur.getCause() == cur) break;
        }
        return false;
    }
}
