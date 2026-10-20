package com.provision.integration;

import com.provision.ProvisionApplication;
import com.provision.dto.auth.LoginRequest;
import com.provision.dto.auth.RegisterRequest;
import com.provision.dto.ingredient.IngredientRequest;
import com.provision.dto.recipe.RecipeRequest;
import com.provision.entity.MealType;
import com.provision.entity.UnitOfMeasure;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
        classes = ProvisionApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT
)
@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Integration Tests - Conflicts")
class ConflictIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_conflict")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.flyway.enabled", () -> "true");
    }

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    private String baseUrl() {
        return "http://localhost:" + port + "/api/v1";
    }

    private HttpHeaders getAdminHeaders() {
        // Register admin
        RegisterRequest registerRequest = new RegisterRequest(
                "admin_conflict@test.com",
                "password123",
                "Admin",
                "User"
        );
        restTemplate.postForEntity(baseUrl() + "/auth/register", registerRequest, Map.class);

        // Login
        LoginRequest loginRequest = new LoginRequest("admin_conflict@test.com", "password123");
        ResponseEntity<Map> loginResponse = restTemplate.postForEntity(
                baseUrl() + "/auth/login",
                loginRequest,
                Map.class
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth((String) loginResponse.getBody().get("accessToken"));
        return headers;
    }

    @Test
    @Order(1)
    @DisplayName("Should return 409 when deleting ingredient used in recipe")
    void shouldReturn409WhenDeletingUsedIngredient() {
        HttpHeaders headers = getAdminHeaders();

        // Create ingredient
        IngredientRequest ingredientRequest = new IngredientRequest(
                "Test Ingredient",
                UnitOfMeasure.KG,
                "Test Category",
                null
        );

        HttpEntity<IngredientRequest> ingredientEntity = new HttpEntity<>(ingredientRequest, headers);
        ResponseEntity<Map> ingredientResponse = restTemplate.postForEntity(
                baseUrl() + "/admin/ingredients",
                ingredientEntity,
                Map.class
        );
        assertThat(ingredientResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Long ingredientId = ((Number) ingredientResponse.getBody().get("id")).longValue();

        // Create recipe with this ingredient
        RecipeRequest recipeRequest = new RecipeRequest(
                "Test Recipe",
                MealType.LUNCH,
                4,
                null,
                List.of(new RecipeRequest.RecipeIngredientItem(ingredientId, new BigDecimal("0.1")))
        );

        HttpEntity<RecipeRequest> recipeEntity = new HttpEntity<>(recipeRequest, headers);
        restTemplate.postForEntity(
                baseUrl() + "/admin/recipes",
                recipeEntity,
                Map.class
        );

        // Try to delete ingredient - should fail with 409
        HttpEntity<Void> deleteEntity = new HttpEntity<>(headers);
        ResponseEntity<Map> deleteResponse = restTemplate.exchange(
                baseUrl() + "/admin/ingredients/" + ingredientId,
                HttpMethod.DELETE,
                deleteEntity,
                Map.class
        );

        assertThat(deleteResponse.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(deleteResponse.getBody()).containsKey("detail");
    }
}
