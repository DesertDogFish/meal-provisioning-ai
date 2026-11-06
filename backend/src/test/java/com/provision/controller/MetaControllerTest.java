package com.provision.controller;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import com.provision.integration.ContainerSuite;
import com.provision.integration.LocalPgFallback;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unit-тест живости MetaController (эндпоинт healthcheck'а бэкенда в docker-compose).
 *
 * FIX (CI 2026-10-23): раньше требовал строго Docker (@Testcontainers + @Container) —
 * падал «Could not find a valid Docker environment» на раннерах без демона. Переведён
 * на @ContainerSuite: Docker есть -> Testcontainers, нет -> LocalPgFallback (initdb/pg_ctl).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@ActiveProfiles("test")
@DisplayName("MetaController")
class MetaControllerTest {

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> com.provision.integration.SharedPostgres.jdbcUrl("provision_meta_test"));
        registry.add("spring.datasource.username", com.provision.integration.SharedPostgres::username);
        registry.add("spring.datasource.password", com.provision.integration.SharedPostgres::password);
    }

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("GET /api/v1/meta возвращает 200 без авторизации")
    void meta_shouldReturnOkWithoutAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/meta"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.db").value("ok"))
                .andExpect(jsonPath("$.version").exists());
    }
}
