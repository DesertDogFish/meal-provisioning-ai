package com.provision.integration;
import java.nio.charset.StandardCharsets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.auth.LoginRequest;
import com.provision.dto.auth.RegisterRequest;
import com.provision.entity.UserRole;
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

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for authentication endpoints
 * AUTH-01 through AUTH-09
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Authentication Integration Tests")
class AuthIntegrationTest {

    /** Docker есть -> Testcontainers; нет -> локальный PG-fallback (LocalPgFallback). */
    private static final boolean LOCAL_PG = !com.provision.integration.LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_auth")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? com.provision.integration.LocalPgFallback.jdbcUrl("provision_test_auth") : postgres.getJdbcUrl());
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

    private static final String TEST_EMAIL = "auth_test@example.com";
    private static final String TEST_PASSWORD = "password123";

    @BeforeEach
    void setUp() {
        // FIX: deleteAll() не давал изоляции каталога (V3-сид) и падал на FK RESTRICT.
        // Полная пересборка схемы из миграций — детерминированное состояние перед каждым тестом.
        TestDataIsolation.reset(jdbc, flyway);
    }

    @Test
    @Order(1)
    @DisplayName("AUTH-01: Register new user successfully")
    void auth01_registerNewUser() throws Exception {
        RegisterRequest request = new RegisterRequest(
                TEST_EMAIL,
                TEST_PASSWORD,
                "John",
                "Doe"
        );

        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(TEST_EMAIL))
                .andExpect(jsonPath("$.firstName").value("John"))
                .andExpect(jsonPath("$.lastName").value("Doe"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andReturn();

        String response = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(response).contains("accessToken");
        assertThat(response).contains("refreshToken");
    }

    @Test
    @Order(2)
    @DisplayName("AUTH-02: Login with valid credentials")
    void auth02_loginSuccessfully() throws Exception {
        // Register first
        RegisterRequest registerRequest = new RegisterRequest(
                TEST_EMAIL,
                TEST_PASSWORD,
                "John",
                "Doe"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated());

        // Login
        LoginRequest loginRequest = new LoginRequest(TEST_EMAIL, TEST_PASSWORD);

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").exists())
                .andExpect(jsonPath("$.refreshToken").exists())
                .andExpect(jsonPath("$.tokenType").value("Bearer"));
    }

    @Test
    @Order(3)
    @DisplayName("AUTH-03: Login with wrong password returns 401")
    void auth03_loginWithWrongPassword() throws Exception {
        // Register first
        RegisterRequest registerRequest = new RegisterRequest(
                TEST_EMAIL,
                TEST_PASSWORD,
                "John",
                "Doe"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated());

        // Login with wrong password
        LoginRequest loginRequest = new LoginRequest(TEST_EMAIL, "wrongpassword");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.detail").value("Invalid email or password"));
    }

    @Test
    @Order(4)
    @DisplayName("AUTH-04: Register with existing email returns 409")
    void auth04_registerWithExistingEmail() throws Exception {
        RegisterRequest request = new RegisterRequest(
                TEST_EMAIL,
                TEST_PASSWORD,
                "John",
                "Doe"
        );

        // First registration
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());

        // Second registration with same email
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    @Order(5)
    @DisplayName("AUTH-05: Register with invalid data returns 400")
    void auth05_registerWithInvalidData() throws Exception {
        RegisterRequest request = new RegisterRequest(
                "invalid-email",
                "123",
                "",
                ""
        );

        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.errors").isArray());
    }

    @Test
    @Order(6)
    @DisplayName("AUTH-06: GET /users/me requires authentication")
    void auth06_getCurrentUser() throws Exception {
        // Without token
        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized());

        // Register and login
        RegisterRequest registerRequest = new RegisterRequest(
                TEST_EMAIL,
                TEST_PASSWORD,
                "John",
                "Doe"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated());

        LoginRequest loginRequest = new LoginRequest(TEST_EMAIL, TEST_PASSWORD);
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();

        String response = loginResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        Map<String, Object> tokens = objectMapper.readValue(response, Map.class);
        String accessToken = (String) tokens.get("accessToken");

        // With token
        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(TEST_EMAIL))
                .andExpect(jsonPath("$.firstName").value("John"))
                .andExpect(jsonPath("$.lastName").value("Doe"));
    }

    @Test
    @Order(7)
    @DisplayName("AUTH-07: Refresh token returns new token pair")
    void auth07_refreshToken() throws Exception {
        // Register and login
        RegisterRequest registerRequest = new RegisterRequest(
                TEST_EMAIL,
                TEST_PASSWORD,
                "John",
                "Doe"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated());

        LoginRequest loginRequest = new LoginRequest(TEST_EMAIL, TEST_PASSWORD);
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();

        String response = loginResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        Map<String, Object> tokens = objectMapper.readValue(response, Map.class);
        String refreshToken = (String) tokens.get("refreshToken");

        // Refresh
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refreshToken + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").exists())
                .andExpect(jsonPath("$.refreshToken").exists());
    }

    @Test
    @Order(8)
    @DisplayName("AUTH-08: Logout invalidates refresh token")
    void auth08_logout() throws Exception {
        // Register and login
        RegisterRequest registerRequest = new RegisterRequest(
                TEST_EMAIL,
                TEST_PASSWORD,
                "John",
                "Doe"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated());

        LoginRequest loginRequest = new LoginRequest(TEST_EMAIL, TEST_PASSWORD);
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();

        String response = loginResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        Map<String, Object> tokens = objectMapper.readValue(response, Map.class);
        String refreshToken = (String) tokens.get("refreshToken");

        // Logout
        mockMvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refreshToken + "\"}"))
                .andExpect(status().isOk());

        // Try to refresh with old token
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refreshToken + "\"}"))
                .andExpect(status().isUnauthorized());
    }
}
