package com.provision.integration;
import java.nio.charset.StandardCharsets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.auth.LoginRequest;
import com.provision.dto.auth.RegisterRequest;
import com.provision.dto.trip.TripRequest;
import com.provision.entity.User;
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

import java.time.LocalDate;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for security and access control
 * SEC-01 through SEC-06
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Security Integration Tests")
class SecurityIntegrationTest {

    /** Docker есть -> Testcontainers; нет -> локальный PG-fallback (LocalPgFallback). */
    private static final boolean LOCAL_PG = !com.provision.integration.LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_sec")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? com.provision.integration.LocalPgFallback.jdbcUrl("provision_test_sec") : postgres.getJdbcUrl());
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

    private String userToken;
    private String adminToken;
    private Long userTripId;

    @BeforeEach
    void setUp() throws Exception {
        // FIX: вместо userRepository.deleteAll() — полная пересборка схемы из миграций.
        TestDataIsolation.reset(jdbc, flyway);

        // Create USER (пароль хэшируется реальным PasswordEncoder через /auth/register)
        userToken = TestUsers.registerUser(mockMvc, objectMapper, "user@test.com");

        // Create ADMIN (раньше был захардкожен чужой BCrypt-хэш, не соответствующий паролю -> логин 401)
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "admin@test.com");

        // Create trip for user
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
                tripResult.getResponse().getContentAsString(StandardCharsets.UTF_8), Map.class);
        userTripId = ((Number) tripData.get("id")).longValue();
    }

    @Test
    @Order(1)
    @DisplayName("SEC-01: USER cannot access admin endpoints")
    void sec01_userCannotAccessAdmin() throws Exception {
        mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Test\",\"unit\":\"KG\",\"category\":\"Test\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @Order(2)
    @DisplayName("SEC-02: USER cannot access other user's trips")
    void sec02_userCannotAccessOtherTrips() throws Exception {
        // Create second user
        String user2Token = TestUsers.registerUser(mockMvc, objectMapper, "user2@test.com");

        // Try to access user1's trip
        mockMvc.perform(get("/api/v1/trips/" + userTripId)
                        .header("Authorization", "Bearer " + user2Token))
                .andExpect(status().isNotFound()); // 404 to not reveal existence
    }

    @Test
    @Order(3)
    @DisplayName("SEC-03: USER cannot delete other user's trips")
    void sec03_userCannotDeleteOtherTrips() throws Exception {
        // Create second user
        String user2Token = TestUsers.registerUser(mockMvc, objectMapper, "user2@test.com");

        // Try to delete user1's trip
        mockMvc.perform(delete("/api/v1/trips/" + userTripId)
                        .header("Authorization", "Bearer " + user2Token))
                .andExpect(status().isNotFound()); // 404 to not reveal existence

        // Verify trip still exists
        mockMvc.perform(get("/api/v1/trips/" + userTripId)
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());
    }

    @Test
    @Order(4)
    @DisplayName("SEC-04: USER cannot modify other user's trip days/meals")
    void sec04_userCannotModifyOtherTrips() throws Exception {
        // Create second user
        String user2Token = TestUsers.registerUser(mockMvc, objectMapper, "user2@test.com");

        // Try to update day
        mockMvc.perform(put("/api/v1/trips/" + userTripId + "/days/1")
                        .header("Authorization", "Bearer " + user2Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"peopleOverride\":5}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @Order(5)
    @DisplayName("SEC-05: Role from token only, not from request body")
    void sec05_roleFromTokenOnly() throws Exception {
        // User tries to access admin endpoint with ADMIN role in body
        mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Test\",\"unit\":\"KG\",\"category\":\"Test\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @Order(6)
    @DisplayName("SEC-06: Invalid JWT signature returns 401")
    void sec06_invalidJwtSignature() throws Exception {
        String invalidToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.invalid_signature";

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + invalidToken))
                .andExpect(status().isUnauthorized());
    }
}
