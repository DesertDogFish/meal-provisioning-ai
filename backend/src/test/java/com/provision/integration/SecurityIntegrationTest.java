package com.provision.integration;

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
@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Security Integration Tests")
class SecurityIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_sec")
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
    private UserRepository userRepository;

    private String userToken;
    private String adminToken;
    private Long userTripId;

    @BeforeEach
    void setUp() throws Exception {
        userRepository.deleteAll();

        // Create USER
        RegisterRequest userRequest = new RegisterRequest(
                "user@test.com",
                "password123",
                "User",
                "Test"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(userRequest)))
                .andExpect(status().isCreated());

        LoginRequest userLogin = new LoginRequest("user@test.com", "password123");
        MvcResult userResult = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(userLogin)))
                .andExpect(status().isOk())
                .andReturn();

        Map<String, Object> userTokens = objectMapper.readValue(
                userResult.getResponse().getContentAsString(), Map.class);
        userToken = (String) userTokens.get("accessToken");

        // Create ADMIN
        User admin = User.builder()
                .email("admin@test.com")
                .passwordHash("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy") // password123
                .firstName("Admin")
                .lastName("Test")
                .role(UserRole.ADMIN)
                .build();
        userRepository.save(admin);

        LoginRequest adminLogin = new LoginRequest("admin@test.com", "password123");
        MvcResult adminResult = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(adminLogin)))
                .andExpect(status().isOk())
                .andReturn();

        Map<String, Object> adminTokens = objectMapper.readValue(
                adminResult.getResponse().getContentAsString(), Map.class);
        adminToken = (String) adminTokens.get("accessToken");

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
                tripResult.getResponse().getContentAsString(), Map.class);
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
        RegisterRequest user2Request = new RegisterRequest(
                "user2@test.com",
                "password123",
                "User2",
                "Test"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(user2Request)))
                .andExpect(status().isCreated());

        LoginRequest user2Login = new LoginRequest("user2@test.com", "password123");
        MvcResult user2Result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(user2Login)))
                .andExpect(status().isOk())
                .andReturn();

        Map<String, Object> user2Tokens = objectMapper.readValue(
                user2Result.getResponse().getContentAsString(), Map.class);
        String user2Token = (String) user2Tokens.get("accessToken");

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
        RegisterRequest user2Request = new RegisterRequest(
                "user2@test.com",
                "password123",
                "User2",
                "Test"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(user2Request)))
                .andExpect(status().isCreated());

        LoginRequest user2Login = new LoginRequest("user2@test.com", "password123");
        MvcResult user2Result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(user2Login)))
                .andExpect(status().isOk())
                .andReturn();

        Map<String, Object> user2Tokens = objectMapper.readValue(
                user2Result.getResponse().getContentAsString(), Map.class);
        String user2Token = (String) user2Tokens.get("accessToken");

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
        RegisterRequest user2Request = new RegisterRequest(
                "user2@test.com",
                "password123",
                "User2",
                "Test"
        );
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(user2Request)))
                .andExpect(status().isCreated());

        LoginRequest user2Login = new LoginRequest("user2@test.com", "password123");
        MvcResult user2Result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(user2Login)))
                .andExpect(status().isOk())
                .andReturn();

        Map<String, Object> user2Tokens = objectMapper.readValue(
                user2Result.getResponse().getContentAsString(), Map.class);
        String user2Token = (String) user2Tokens.get("accessToken");

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
