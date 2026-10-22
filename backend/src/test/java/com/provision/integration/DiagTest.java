package com.provision.integration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@SpringBootTest
@AutoConfigureMockMvc
class DiagTest {
    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", () -> LocalPgFallback.jdbcUrl("provision_test_diag"));
        r.add("spring.datasource.username", () -> "test");
        r.add("spring.datasource.password", () -> "test");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired org.flywaydb.core.Flyway flyway;
    @Autowired MockMvc mockMvc;

    @Test
    void diag() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        String token = TestUsers.registerUser(mockMvc, new com.fasterxml.jackson.databind.ObjectMapper(), "diag@test.com");
        var res = mockMvc.perform(get("/api/v1/recipes?mealType=BREAKFAST").header("Authorization", "Bearer " + token)).andReturn();
        System.err.println("DIAG-FILTER status=" + res.getResponse().getStatus());
        if (res.getResponse().getStatus() == 500) {
            Exception ex = res.getResolvedException();
            System.err.println("DIAG-EX: " + (ex != null ? ex.getClass() + ": " + ex.getMessage() : "null"));
            Throwable c = ex != null ? ex.getCause() : null;
            while (c != null) { System.err.println("DIAG-CAUSE: " + c.getClass() + ": " + truncate(c.getMessage())); c = c.getCause(); }
        }
    }
    static String truncate(String s) { return s == null ? "null" : (s.length() > 400 ? s.substring(0, 400) : s); }
}
