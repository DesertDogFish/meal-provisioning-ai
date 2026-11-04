package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@DisplayName("BL-5: product EMIS binding integration")
class ProductEmisBindingIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private org.flywaydb.core.Flyway flyway;

    private String adminToken;
    private Long categoryId;

    @BeforeEach
    void setUp() throws Exception {
        TestDataIsolation.reset(jdbc, flyway);
        adminToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "binding@test.com");
        categoryId = firstCategoryId();
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder b) {
        return b.header("Authorization", "Bearer " + adminToken)
                .with(MockMvcUtf8PostProcessor.utf8Query());
    }

    private Long firstCategoryId() {
        Long id = jdbc.queryForObject("SELECT id FROM product_categories ORDER BY id LIMIT 1", Long.class);
        return id == null ? 1L : id;
    }

    private String freeEmisCode(String nameLike) {
        String code = jdbc.queryForObject("""
                SELECT p.code FROM emis_products p
                 WHERE lower(p.name) LIKE lower(?)
                   AND NOT EXISTS (SELECT 1 FROM ingredients i
                                    WHERE i.emis_code = p.code AND i.trip_id IS NULL)
                 ORDER BY p.code LIMIT 1
                """, String.class, "%" + nameLike + "%");
        assertThat(code).as("free EMIS position").isNotBlank();
        return code;
    }

    private long usedProductId() {
        Long id = jdbc.queryForObject("""
                SELECT ri.ingredient_id FROM recipe_ingredients ri
                  JOIN ingredients i ON i.id = ri.ingredient_id
                 WHERE i.trip_id IS NULL
                 ORDER BY ri.ingredient_id LIMIT 1
                """, Long.class);
        assertThat(id).as("product used in recipe").isNotNull();
        return id;
    }

    private Map<String, Object> productBody(String name, String unit, String emisCode) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("categoryId", categoryId);
        body.put("unit", unit);
        body.put("emisCode", emisCode);
        return body;
    }

    private long createProduct(String name, String unit, String emisCode) throws Exception {
        String response = mockMvc.perform(auth(post("/api/v1/admin/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(productBody(name, unit, emisCode))
                                .getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(response).get("id").asLong();
    }

    @Test
    @DisplayName("BL-5: nonexistent emisCode -> 400")
    void nonexistentEmisCodeReturnsValidationError() throws Exception {
        mockMvc.perform(auth(post("/api/v1/admin/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                        productBody("Test product", "KG", "999999"))
                                .getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Validation Error"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(
                        "not found in local catalog")));
    }

    @Test
    @DisplayName("BL-5: unbind (emisCode = null) -> 200, NOT_LINKED")
    void unbindProductFromEmisCodeSucceeds() throws Exception {
        String code = freeEmisCode("Coffee");
        long id = createProduct("Coffee test", "KG", code);

        String response = mockMvc.perform(auth(put("/api/v1/admin/products/" + id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                        productBody("Coffee test", "KG", null))
                                .getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        JsonNode json = objectMapper.readTree(response);
        assertThat(json.get("emisCode").isNull()).isTrue();
        assertThat(json.get("priceSyncStatus").asText()).isEqualTo("NOT_LINKED");
    }

    @Test
    @DisplayName("BL-5: rename product used in recipe -> 409 PRODUCT_IN_USE")
    void productInUseBlocksRename() throws Exception {
        long id = usedProductId();
        String currentName = jdbc.queryForObject(
                "SELECT name FROM ingredients WHERE id = ?", String.class, id);
        String unit = jdbc.queryForObject(
                "SELECT unit FROM ingredients WHERE id = ?", String.class, id);

        mockMvc.perform(auth(put("/api/v1/admin/products/" + id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                        productBody(currentName + " v2", unit, null))
                                .getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Conflict"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(
                        "PRODUCT_IN_USE")));
    }

    @Test
    @DisplayName("BL-5: change emisCode on used product -> 200")
    void productInUseAllowsEmisCodeChange() throws Exception {
        long id = usedProductId();
        String currentName = jdbc.queryForObject(
                "SELECT name FROM ingredients WHERE id = ?", String.class, id);
        String unit = jdbc.queryForObject(
                "SELECT unit FROM ingredients WHERE id = ?", String.class, id);
        String newCode = freeEmisCode("Coffee");

        mockMvc.perform(auth(put("/api/v1/admin/products/" + id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                        productBody(currentName, unit, newCode))
                                .getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emisCode").value(newCode));
    }
}
