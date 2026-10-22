package com.provision.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.ingredient.IngredientRequest;
import com.provision.dto.recipe.RecipeRequest;
import com.provision.dto.trip.TripMealRequest;
import com.provision.dto.trip.TripRequest;
import com.provision.entity.MealType;
import com.provision.entity.UnitOfMeasure;
import com.provision.repository.UserRepository;
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
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for conflict scenarios
 * ING-05, ING-06, REC-07
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Conflict Integration Tests")
class ConflictIntegrationTest {

    /** Docker есть -> Testcontainers; нет -> локальный PG-fallback (LocalPgFallback). */
    private static final boolean LOCAL_PG = !com.provision.integration.LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_conflict")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? com.provision.integration.LocalPgFallback.jdbcUrl("provision_test_conflict") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    private String adminToken;
    private String userToken;

    @BeforeEach
    void setUp() throws Exception {
        userRepository.deleteAll();

        // FIX: раньше ADMIN заводился с захардкоженным BCrypt-хэшем из чужих доков,
        // который НЕ соответствует паролю "password123" -> логин давал 401 и весь класс падал.
        // TestUsers создаёт пользователей с корректным хэшем через реальный PasswordEncoder.
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, userRepository, "admin@test.com");
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "user@test.com");
    }

    @Test
    @Order(1)
    @DisplayName("ING-05: Cannot delete ingredient used in recipe - returns 409 with recipe list")
    void ing05_cannotDeleteUsedIngredient() throws Exception {
        // Create ingredient
        IngredientRequest ingredientRequest = new IngredientRequest(
                null,  // code
                "Гречка",
                UnitOfMeasure.KG,
                "Крупы",
                null,  // kcalPer100g
                null   // pieceWeightG
        );
        MvcResult ingredientResult = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ingredientRequest)))
                .andExpect(status().isCreated())
                .andReturn();

        Map<String, Object> ingredientData = objectMapper.readValue(
                ingredientResult.getResponse().getContentAsString(), Map.class);
        Long ingredientId = ((Number) ingredientData.get("id")).longValue();

        // Create recipe with this ingredient
        RecipeRequest recipeRequest = new RecipeRequest(
                "Гречка с тушенкой",
                MealType.LUNCH,
                null,  // category
                null,  // cookMinutes
                4,
                450,
                List.of(new RecipeRequest.RecipeIngredientItem(ingredientId, new BigDecimal("0.8")))
        );
        mockMvc.perform(post("/api/v1/admin/recipes")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recipeRequest)))
                .andExpect(status().isCreated());

        // Try to delete ingredient - should fail with 409
        mockMvc.perform(delete("/api/v1/admin/ingredients/" + ingredientId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.detail").exists());
    }

    @Test
    @Order(2)
    @DisplayName("ING-06: Cannot update ingredient used in recipe - returns 409")
    void ing06_cannotUpdateUsedIngredient() throws Exception {
        // Create ingredient
        IngredientRequest ingredientRequest = new IngredientRequest(
                null,  // code
                "Гречка",
                UnitOfMeasure.KG,
                "Крупы",
                null,  // kcalPer100g
                null   // pieceWeightG
        );
        MvcResult ingredientResult = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ingredientRequest)))
                .andExpect(status().isCreated())
                .andReturn();

        Map<String, Object> ingredientData = objectMapper.readValue(
                ingredientResult.getResponse().getContentAsString(), Map.class);
        Long ingredientId = ((Number) ingredientData.get("id")).longValue();

        // Create recipe with this ingredient
        RecipeRequest recipeRequest = new RecipeRequest(
                "Гречка с тушенкой",
                MealType.LUNCH,
                null,  // category
                null,  // cookMinutes
                4,
                450,
                List.of(new RecipeRequest.RecipeIngredientItem(ingredientId, new BigDecimal("0.8")))
        );
        mockMvc.perform(post("/api/v1/admin/recipes")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recipeRequest)))
                .andExpect(status().isCreated());

        // Try to update ingredient - should fail with 409
        IngredientRequest updateRequest = new IngredientRequest(
                null,  // code
                "Гречка обновленная",
                UnitOfMeasure.KG,
                "Крупы",
                null,  // kcalPer100g
                null   // pieceWeightG
        );
        mockMvc.perform(put("/api/v1/admin/ingredients/" + ingredientId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    @Order(3)
    @DisplayName("REC-07: Cannot delete recipe used in trip meals - returns 409")
    void rec07_cannotDeleteUsedRecipe() throws Exception {
        // Create ingredient
        IngredientRequest ingredientRequest = new IngredientRequest(
                null,  // code
                "Гречка",
                UnitOfMeasure.KG,
                "Крупы",
                null,  // kcalPer100g
                null   // pieceWeightG
        );
        MvcResult ingredientResult = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ingredientRequest)))
                .andExpect(status().isCreated())
                .andReturn();

        Map<String, Object> ingredientData = objectMapper.readValue(
                ingredientResult.getResponse().getContentAsString(), Map.class);
        Long ingredientId = ((Number) ingredientData.get("id")).longValue();

        // Create recipe
        RecipeRequest recipeRequest = new RecipeRequest(
                "Гречка с тушенкой",
                MealType.LUNCH,
                null,  // category
                null,  // cookMinutes
                4,
                450,
                List.of(new RecipeRequest.RecipeIngredientItem(ingredientId, new BigDecimal("0.8")))
        );
        MvcResult recipeResult = mockMvc.perform(post("/api/v1/admin/recipes")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recipeRequest)))
                .andExpect(status().isCreated())
                .andReturn();

        Map<String, Object> recipeData = objectMapper.readValue(
                recipeResult.getResponse().getContentAsString(), Map.class);
        Long recipeId = ((Number) recipeData.get("id")).longValue();

        // Create trip
        TripRequest tripRequest = new TripRequest(
                "Test Trip",
                LocalDate.of(2026, 5, 12),
                LocalDate.of(2026, 5, 14),
                4,
                "Test notes"
        );
        MvcResult tripResult = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(tripRequest)))
                .andExpect(status().isCreated())
                .andReturn();

        Map<String, Object> tripData = objectMapper.readValue(
                tripResult.getResponse().getContentAsString(), Map.class);
        Long tripId = ((Number) tripData.get("id")).longValue();

        // Get first day ID
        List<Map<String, Object>> days = (List<Map<String, Object>>) tripData.get("days");
        Long dayId = ((Number) days.get(0).get("id")).longValue();

        // Add meal with this recipe
        TripMealRequest mealRequest = new TripMealRequest(
                MealType.LUNCH,
                recipeId,
                null,
                1
        );
        mockMvc.perform(post("/api/v1/trips/" + tripId + "/days/" + dayId + "/meals")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(mealRequest)))
                .andExpect(status().isCreated());

        // Try to delete recipe - should fail with 409
        mockMvc.perform(delete("/api/v1/admin/recipes/" + recipeId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.detail").exists());
    }
}
