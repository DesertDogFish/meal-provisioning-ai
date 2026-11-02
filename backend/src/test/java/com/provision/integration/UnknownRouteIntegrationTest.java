package com.provision.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.auth.LoginRequest;
import com.provision.dto.auth.RegisterRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Подзадача 10 аудита 02.11.2026 (план plans/2026-11-02-audit-security-usability-ui.md,
 * BL-65): неизвестный API-путь обязан отдавать 404 ProblemDetail, а не 500.
 *
 * <p>Spring Boot 3.2 отправляет неизвестный путь в ResourceHttpRequestHandler,
 * который бросает {@code NoResourceFoundException}; без выделенного обработчика
 * его перехватывал {@code @ExceptionHandler(Exception.class)} → 500 «An unexpected
 * error occurred». Mock-слой при этом отвечает 404 («Route … not implemented in
 * mock») — паритет форм ответа был нарушен.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@DisplayName("Неизвестный API-путь → 404 ProblemDetail (подзадача 10 аудита 02.11.2026)")
class UnknownRouteIntegrationTest {

    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null
            : new PostgreSQLContainer<>("postgres:15-alpine")
                    .withDatabaseName("provision_test_unknown_route")
                    .withUsername("test")
                    .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG
                ? LocalPgFallback.jdbcUrl("provision_test_unknown_route") : postgres.getJdbcUrl());
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

    private static final String EMAIL = "unknown-route@example.com";
    private static final String PASSWORD = "password123";

    @BeforeEach
    void setUp() {
        TestDataIsolation.reset(jdbc, flyway);
    }

    private String accessToken() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new RegisterRequest(EMAIL, PASSWORD, "Route", "Tester"))))
                .andExpect(status().isCreated());
        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(EMAIL, PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();
        Map<String, Object> tokens = objectMapper.readValue(
                login.getResponse().getContentAsString(StandardCharsets.UTF_8), Map.class);
        return (String) tokens.get("accessToken");
    }

    @Test
    @DisplayName("GET /api/v1/definitely-not-here c валидным токеном → 404 ProblemDetail (не 500)")
    void unknownApiRoute_returns404ProblemDetail() throws Exception {
        String token = accessToken();

        mockMvc.perform(get("/api/v1/definitely-not-here")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("about:blank"))
                .andExpect(jsonPath("$.title").value("Not Found"))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.instance").value("/api/v1/definitely-not-here"));
    }

    @Test
    @DisplayName("Неизвестный вложенный путь ресурса — тоже 404, не 500")
    void unknownNestedRoute_returns404() throws Exception {
        String token = accessToken();

        mockMvc.perform(get("/api/v1/trips/999999/subresource-that-does-not-exist")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }
}
