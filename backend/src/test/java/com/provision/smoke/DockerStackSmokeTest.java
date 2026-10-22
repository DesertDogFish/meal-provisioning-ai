package com.provision.smoke;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Smoke-тесты живости стека: полный пользовательский путь
 * регистрация → логин → создание продукта → данные сохраняются.
 *
 * Проверяет то же, что видит пользователь после `docker compose up --build`,
 * но против бэкенда с реальной PostgreSQL (Testcontainers, образ postgres:15-alpine).
 *
 * Примечание: эндпоинты создания продуктов защищены @PreAuthorize("hasRole('ADMIN')"),
 * а регистрация выдаёт роль USER — поэтому тест повышает роль через UserRepository
 * (имитация сида администратора).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("test")
@DisplayName("Docker stack smoke tests")
class DockerStackSmokeTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_smoke")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private com.provision.repository.UserRepository userRepository;

    @Autowired
    private com.provision.repository.IngredientRepository ingredientRepository;

    private static final String EMAIL = "smoke-" + System.nanoTime() + "@test.local";
    private static final String PASSWORD = "password123";

    @Test
    @DisplayName("SMOKE-01: /api/v1/meta доступен без авторизации (healthcheck бэкенда)")
    void meta_isPublicAndReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/meta"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.db").value("ok"));
    }

    @Test
    @DisplayName("SMOKE-02: регистрация нового пользователя возвращает 201")
    void register_returnsCreated() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "email", EMAIL,
                "password", PASSWORD,
                "firstName", "Smoke",
                "lastName", "Tester"
        ));

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(EMAIL));
    }

    @Test
    @DisplayName("SMOKE-03: логин возвращает JWT-токен")
    void login_returnsToken() throws Exception {
        ensureUserExists();

        String body = objectMapper.writeValueAsString(Map.of(
                "email", EMAIL,
                "password", PASSWORD
        ));

        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("accessToken").asText()).isNotBlank();
        assertThat(json.get("tokenType").asText()).isEqualTo("Bearer");
    }

    @Test
    @DisplayName("SMOKE-04: продукт создаётся и сохраняется (полный путь)")
    void createProduct_persists() throws Exception {
        ensureUserExists();
        makeAdmin();

        // 1. Логин
        String token = login();

        // 2. Категория из справочника (сид V8)
        MvcResult catResult = mockMvc.perform(get("/api/v1/product-categories")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode categories = objectMapper.readTree(catResult.getResponse().getContentAsString());
        assertThat(categories.isArray()).isTrue();
        long categoryId = categories.get(0).get("id").asLong();

        // 3. Создание продукта
        // CR-1: для PCS/PACK при kcalPer100g обязателен pieceWeightG — указываем его.
        String uniqueName = "Smoke Product " + System.nanoTime();
        String productBody = objectMapper.writeValueAsString(Map.of(
                "name", uniqueName,
                "categoryId", categoryId,
                "unit", "PCS",
                "packSize", 1,
                "kcalPer100g", 350,
                "pieceWeightG", 60
        ));

        MvcResult createResult = mockMvc.perform(post("/api/v1/admin/products")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(uniqueName))
                .andReturn();
        long productId = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("id").asLong();

        // 4. Продукт сохранился — виден в списке (данные переживают запрос)
        MvcResult listResult = mockMvc.perform(get("/api/v1/admin/products")
                        .param("page", "0")
                        .param("size", "1000")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode page = objectMapper.readTree(listResult.getResponse().getContentAsString());
        assertThat(page.get("content").toString()).contains(uniqueName);

        // Проверка персистентности напрямую через репозиторий (GET /{id} в контроллере отсутствует)
        Optional<com.provision.entity.Ingredient> saved =
                ingredientRepository.findById(productId);
        assertThat(saved).isPresent();
        assertThat(saved.get().getName()).isEqualTo(uniqueName);
    }

    @Test
    @DisplayName("SMOKE-05: Flyway применил миграции — каталог продуктов сидирован")
    void flywaySeed_catalogPresent() throws Exception {
        ensureUserExists();
        makeAdmin();
        String token = login();

        MvcResult result = mockMvc.perform(get("/api/v1/admin/products")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode page = objectMapper.readTree(result.getResponse().getContentAsString());
        // Сид каталога V3__seed_catalog.sql: десятки продуктов
        assertThat(page.get("totalElements").asLong()).isGreaterThan(10);
    }

    // --- helpers ---

    private void ensureUserExists() throws Exception {
        if (!userRepository.existsByEmail(EMAIL)) {
            String body = objectMapper.writeValueAsString(Map.of(
                    "email", EMAIL,
                    "password", PASSWORD,
                    "firstName", "Smoke",
                    "lastName", "Tester"
            ));
            mockMvc.perform(post("/api/v1/auth/register")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body));
        }
    }

    private void makeAdmin() {
        Optional<com.provision.entity.User> user = userRepository.findByEmail(EMAIL);
        user.ifPresent(u -> {
            u.setRole(com.provision.entity.UserRole.ADMIN);
            userRepository.save(u);
        });
    }

    private String login() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "email", EMAIL,
                "password", PASSWORD
        ));
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("accessToken").asText();
    }
}
