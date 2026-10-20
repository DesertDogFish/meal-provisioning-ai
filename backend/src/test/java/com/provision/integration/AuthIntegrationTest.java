package com.provision.integration;

import com.provision.ProvisionApplication;
import com.provision.dto.auth.LoginRequest;
import com.provision.dto.auth.RegisterRequest;
import com.provision.entity.UserRole;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
        classes = ProvisionApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT
)
@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Integration Tests - Auth")
class AuthIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test")
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
        return "http://localhost:" + port + "/api/v1/auth";
    }

    @Test
    @Order(1)
    @DisplayName("Should register new user")
    void shouldRegisterUser() {
        RegisterRequest request = new RegisterRequest(
                "test@example.com",
                "password123",
                "John",
                "Doe"
        );

        ResponseEntity<Map> response = restTemplate.postForEntity(
                baseUrl() + "/register",
                request,
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).containsKey("email");
        assertThat(response.getBody().get("email")).isEqualTo("test@example.com");
    }

    @Test
    @Order(2)
    @DisplayName("Should login user")
    void shouldLoginUser() {
        LoginRequest request = new LoginRequest(
                "test@example.com",
                "password123"
        );

        ResponseEntity<Map> response = restTemplate.postForEntity(
                baseUrl() + "/login",
                request,
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsKey("accessToken");
        assertThat(response.getBody()).containsKey("refreshToken");
        assertThat(response.getBody().get("tokenType")).isEqualTo("Bearer");
    }

    @Test
    @Order(3)
    @DisplayName("Should reject login with wrong password")
    void shouldRejectWrongPassword() {
        LoginRequest request = new LoginRequest(
                "test@example.com",
                "wrongpassword"
        );

        ResponseEntity<Map> response = restTemplate.postForEntity(
                baseUrl() + "/login",
                request,
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @Order(4)
    @DisplayName("Should reject registration with existing email")
    void shouldRejectDuplicateEmail() {
        RegisterRequest request = new RegisterRequest(
                "test@example.com",
                "password123",
                "Jane",
                "Smith"
        );

        ResponseEntity<Map> response = restTemplate.postForEntity(
                baseUrl() + "/register",
                request,
                Map.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }
}
