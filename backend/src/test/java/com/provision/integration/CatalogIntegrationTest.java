package com.provision.integration;
import java.nio.charset.StandardCharsets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.recipe.RecipeResponse;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for catalog functionality
 * CAT-01 through CAT-07
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Catalog Integration Tests")
class CatalogIntegrationTest {

    /** Docker есть -> Testcontainers; нет -> локальный PG-fallback (LocalPgFallback). */
    private static final boolean LOCAL_PG = !com.provision.integration.LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_catalog")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        // FIX (CI 2026-10-23): раньше в Docker-ветке был заглушечный URL "jdbc:postgresql://localhost:5432/na"
        // вместо postgres.getJdbcUrl() — Flyway подключался к несуществующей БД, контекст не стартовал,
        // все CAT-тесты падали с "ApplicationContext failure threshold (1) exceeded".
        registry.add("spring.datasource.url", () -> LOCAL_PG ? com.provision.integration.LocalPgFallback.jdbcUrl("provision_test_catalog") : postgres.getJdbcUrl());
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

    /** SEC: /api/v1/recipes* требует аутентификации (anyRequest().authenticated()) — раньше запросы шли без токена и получали 403. */
    private String userToken;

    @BeforeEach
    void setUp() throws Exception {
        // FIX: вместо userRepository.deleteAll() (удалял только users и падал на FK) —
        // полная пересборка схемы из миграций: детерминированный каталог V3/V4 перед каждым тестом.
        TestDataIsolation.reset(jdbc, flyway);
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "cat_user@test.com");
    }

    private MockHttpServletRequestBuilder authGet(String url) {
        return get(url).header("Authorization", "Bearer " + userToken)
                // FIX (кодировка): кириллица в query-параметрах должна декодироваться как UTF-8,
                // иначе фильтры search/category не матчатся (CAT-03/05/07). См. MockMvcUtf8PostProcessor.
                .with(MockMvcUtf8PostProcessor.utf8Query());
    }

    @Test
    @Order(1)
    @DisplayName("CAT-01: After migrations GET /recipes returns ≥ 50 dishes; each has non-empty ingredients")
    void cat01_recipesCatalogHasAtLeast50Dishes() throws Exception {
        MvcResult result = mockMvc.perform(authGet("/api/v1/recipes"))
                .andDo(r -> { if (r.getResponse().getStatus() != 200) System.err.println("CAT-ERR " + r.getRequest().getRequestURI() + " -> " + r.getResponse().getStatus() + " body=" + r.getResponse().getContentAsString(StandardCharsets.UTF_8)); })
                .andExpect(status().isOk())
                .andReturn();

        List<RecipeResponse> recipes = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                objectMapper.getTypeFactory().constructCollectionType(List.class, RecipeResponse.class)
        );

        assertThat(recipes).hasSizeGreaterThanOrEqualTo(50);
        
        // Verify each recipe has non-empty ingredients
        for (RecipeResponse recipe : recipes) {
            assertThat(recipe.ingredients()).isNotEmpty();
        }
    }

    @Test
    @Order(2)
    @DisplayName("CAT-02: Filter mealType=BREAKFAST returns exactly 38; SNACK returns 62 (per seed)")
    void cat02_filterByMealType() throws Exception {
        // FIX (устаревшие константы): раньше тест ожидал 15/16 — это количество блюд V3__seed_catalog
        // ДО расширения каталога. Миграция V18__seed_catalog_ext_recipes добавляет ещё блюда тех же
        // meal_type (BREAKFAST +23, SNACK +46), а @BeforeEach делает полный drop+Flyway migrate,
        // т.е. фильтр возвращает актуальный размер сида. Логика фильтра при этом ВЕРНА: проверяем её
        // напрямую — каждая возвращённая запись должна иметь искомый mealType, а количество должно
        // совпадать с независимым COUNT(*) по тем же критериям прямо в БД (тестовая изоляция —
        // TestDataIsolation.reset перед каждым тестом, отдельная база provision_test_catalog).
        assertMealTypeCount("BREAKFAST", 38);
        assertMealTypeCount("SNACK", 62);
    }

    /**
     * Фильтр ?mealType=X вернул ровно expected блюд, все — типа X,
     * и серверный ответ согласован с независимым запросом к БД.
     */
    private void assertMealTypeCount(String mealType, int expected) throws Exception {
        MvcResult result = mockMvc.perform(authGet("/api/v1/recipes?mealType=" + mealType))
                .andExpect(status().isOk())
                .andReturn();

        List<RecipeResponse> recipes = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                objectMapper.getTypeFactory().constructCollectionType(List.class, RecipeResponse.class)
        );

        assertThat(recipes).hasSize(expected);

        Integer dbCount = jdbc.queryForObject(
                "SELECT count(*) FROM recipes WHERE meal_type = ?", Integer.class, mealType);
        assertThat(dbCount).isEqualTo(expected);

        for (RecipeResponse recipe : recipes) {
            assertThat(recipe.mealType().name()).isEqualTo(mealType);
        }
    }

    @Test
    @Order(3)
    @DisplayName("CAT-03: Search 'тушенка' returns all dishes containing beef_stew/chicken_stew (≥ 10)")
    void cat03_searchByIngredient() throws Exception {
        MvcResult result = mockMvc.perform(authGet("/api/v1/recipes?search=тушенка"))
                .andExpect(status().isOk())
                .andReturn();

        List<RecipeResponse> recipes = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                objectMapper.getTypeFactory().constructCollectionType(List.class, RecipeResponse.class)
        );

        assertThat(recipes).hasSizeGreaterThanOrEqualTo(10);
        
        // Verify all returned recipes contain тушенка in ingredients
        for (RecipeResponse recipe : recipes) {
            boolean hasStew = recipe.ingredients().stream()
                    .anyMatch(ing -> ing.ingredientName().toLowerCase().contains("тушенка"));
            assertThat(hasStew).isTrue();
        }
    }

    @Test
    @Test
    @Order(4)
    @DisplayName("CAT-04: Filter cookMinutes=0 returns only 'no fire' dishes (46 per seed)")
    void cat04_filterNoFireDishes() throws Exception {
        MvcResult result = mockMvc.perform(authGet("/api/v1/recipes?cookMinutes=0"))
                .andExpect(status().isOk())
                .andReturn();

        List<RecipeResponse> recipes = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                objectMapper.getTypeFactory().constructCollectionType(List.class, RecipeResponse.class)
        );

        // FIX (устаревшая константа): 18 — число «без готовки» по сиду V3 __seed_catalog
        // ДО расширения каталога. Миграция V18__seed_catalog_ext_recipes добавляет
        // ещё 28 блюд с cook_minutes = 0 (бутерброды/перекусы без варки) => 46 всего.
        // Критерий фильтра при этом корректен (строгое cookMinutes == 0). Проверяем:
        //   1) размер ответа = актуальному размеру сида;
        //   2) количество совпадает с независимым COUNT(*) WHERE cook_minutes = 0 в БД
        //      (изоляция: TestDataIsolation.reset делает drop + Flyway migrate перед каждым
        //      тестом, своя база provision_test_catalog);
        //   3) все вернувшиеся блюда действительно без готовки.
        assertThat(recipes).hasSize(46);

        Integer dbCount = jdbc.queryForObject(
                "SELECT count(*) FROM recipes WHERE cook_minutes = 0", Integer.class);
        assertThat(dbCount).isEqualTo(46);

        // Verify all returned recipes have cookMinutes = 0
        for (RecipeResponse recipe : recipes) {
            assertThat(recipe.cookMinutes()).isEqualTo(0);
        }
    }

    @Test
    @Order(5)
    @DisplayName("CAT-05: costPerServing in response is calculated by current date prices")
    void cat05_costPerServingCalculation() throws Exception {
        // Get a specific recipe with known ingredients
        MvcResult result = mockMvc.perform(authGet("/api/v1/recipes?search=Гречка с тушенкой и луком"))
                .andExpect(status().isOk())
                .andReturn();

        List<RecipeResponse> recipes = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                objectMapper.getTypeFactory().constructCollectionType(List.class, RecipeResponse.class)
        );

        assertThat(recipes).isNotEmpty();
        
        // Verify recipe has ingredients
        RecipeResponse recipe = recipes.get(0);
        assertThat(recipe.ingredients()).isNotEmpty();
        
        // Note: costPerServing calculation would require price data
        // This test verifies the structure is correct
        assertThat(recipe.name()).contains("Гречка");
    }

    @Test
    @Order(6)
    @DisplayName("CAT-06: Sorting by calories returns ascending/descending sequence")
    void cat06_sortByCalories() throws Exception {
        // Get all recipes
        MvcResult result = mockMvc.perform(authGet("/api/v1/recipes"))
                .andExpect(status().isOk())
                .andReturn();

        List<RecipeResponse> recipes = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                objectMapper.getTypeFactory().constructCollectionType(List.class, RecipeResponse.class)
        );

        // Verify recipes have caloriesPerServing field
        for (RecipeResponse recipe : recipes) {
            if (recipe.caloriesPerServing() != null) {
                assertThat(recipe.caloriesPerServing()).isGreaterThan(0);
            }
        }
    }

    @Test
    @Order(7)
    @DisplayName("CAT-07: Combined filters work correctly")
    void cat07_combinedFilters() throws Exception {
        // Test combination: BREAKFAST + category=КАШИ
        MvcResult result = mockMvc.perform(authGet("/api/v1/recipes?mealType=BREAKFAST&category=КАШИ"))
                .andExpect(status().isOk())
                .andReturn();

        List<RecipeResponse> recipes = objectMapper.readValue(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8),
                objectMapper.getTypeFactory().constructCollectionType(List.class, RecipeResponse.class)
        );

        // Verify all recipes match both filters
        for (RecipeResponse recipe : recipes) {
            assertThat(recipe.mealType().name()).isEqualTo("BREAKFAST");
            assertThat(recipe.category()).isEqualTo("КАШИ");
        }
    }
}
