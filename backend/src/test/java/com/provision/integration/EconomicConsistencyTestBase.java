package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.trip.TripPriceOverrideRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared container/Spring/Jackson/JUnit setup for EK domain tests.
 *
 * Compatibility note: the former monolithic {@code EconomicConsistencyTest} was split
 * into domain-specific classes to avoid duplicate test IDs and reduce coupling:
 *   EK-01 -> EconomicConsistencyMenuTest
 *   EK-02, EK-03, EK-06 -> EconomicConsistencyShoppingTest
 *   EK-04 -> EconomicConsistencyPersonTest
 *   EK-05, EK-08 -> EconomicConsistencyCompositionTest
 *   EK-07 -> EconomicConsistencyIsolationTest
 *   EK-09 -> EconomicConsistencyIntegrityTest
 *   EK-10 -> EconomicConsistencyScreensTest
 * Shared fixtures live in EconomicConsistencySupport (parseX(objectMapper, ...)).
 * The old EconomicConsistencyTest no longer exists; do not recreate it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@ActiveProfiles({"test", "econ"})
@DisplayName("E2E-ECON base")
public abstract class EconomicConsistencyTestBase {

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> SharedPostgres.jdbcUrl("provision_test_econ"));
        registry.add("spring.datasource.username", SharedPostgres::username);
        registry.add("spring.datasource.password", SharedPostgres::password);
    }

    protected static final LocalDate START = LocalDate.of(2026, 7, 1);
    protected static final LocalDate END = LocalDate.of(2026, 7, 3);
    protected static final int DEFAULT_PEOPLE = 4;
    protected static final String PRICE_BASE_DATE = "2026-01-01";

    protected Long grechkaId, tushenkaId, masloId, risId, solId, sgushId;
    protected Long r1Id, r2Id, r3Id;
    protected Long tripId, day1Id, day2Id, day3Id;
    protected Long mealD1R1Id, mealD3R1Id;
    protected final Map<Long, Long> snap = new HashMap<>();

    @Autowired protected MockMvc mockMvc;
    @Autowired protected ObjectMapper objectMapper;
    @Autowired protected org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired protected org.flywaydb.core.Flyway flyway;

    protected String admin;

    @BeforeEach
    void setUp() {
        TestDataIsolation.reset(jdbc, flyway);
    }

    // ==================== фикстуры (только публичное API) ====================

    /** Полный продуктовый сценарий: каталог → цены → рецепты → поход → приёмы → состав Д3. */
    protected void createFixtures() throws Exception {
        admin = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "econ-guardian@test.com");
        Long categoryId = firstCategoryId();

        grechkaId = createProduct("ЭК Гречка", "KG", categoryId, 343, null, null, null);
        tushenkaId = createProduct("ЭК Тушёнка", "PCS", categoryId, 215, 250, null, null);
        masloId = createProduct("ЭК Масло", "KG", categoryId, 734, null, "0.2", true);
        risId = createProduct("ЭК Рис", "KG", categoryId, 340, null, null, null);
        solId = createProduct("ЭК Соль", "KG", categoryId, null, null, null, null);
        sgushId = createProduct("ЭК Сгущёнка", "KG", categoryId, 320, null, null, null);

        setPrice(grechkaId, "100.00", PRICE_BASE_DATE);
        setPrice(tushenkaId, "200.00", PRICE_BASE_DATE);
        setPrice(masloId, "400.00", PRICE_BASE_DATE);
        setPrice(risId, "50.00", PRICE_BASE_DATE);
        setPrice(solId, "10.00", PRICE_BASE_DATE);
        setPrice(sgushId, "300.00", PRICE_BASE_DATE);
        // Дорожая цена внутри окна похода: план обязан остаться на замороженных 100.00.
        setPrice(grechkaId, "130.00", "2026-07-02");

        r1Id = createRecipe("ЭК Каша гречневая", 2, 500,
                Map.of(grechkaId, "0.4", tushenkaId, "2", solId, "0.02"));
        r2Id = createRecipe("ЭК Рис с маслом", 4, 400,
                Map.of(risId, "0.8", masloId, "0.2"));
        r3Id = createRecipe("ЭК Гречка с маслом", 1, 350,
                Map.of(grechkaId, "0.25", masloId, "0.05"));

        tripId = createTrip("ЭК Поход экономический", START, END, DEFAULT_PEOPLE);
        day1Id = dayIdByDate(START);
        day2Id = dayIdByDate(START.plusDays(1));
        day3Id = dayIdByDate(START.plusDays(2));

        mealD1R1Id = addMeal(day1Id, "BREAKFAST", r1Id, 10);
        addMeal(day2Id, "BREAKFAST", r2Id, null);   // без оверрайда → defaultPeople=4
        addMeal(day2Id, "DINNER", r3Id, 6);
        mealD3R1Id = addMeal(day3Id, "BREAKFAST", r1Id, 4);

        loadSnapshotIds();

        // Состав приёма Д3-R1 — так же, как это делает Модалка B: берём строки из GET
        // (id снепшотов), а НОВЫЙ продукт (EXTRA/SUBST-цель) — из глобального справочника.
        EconomicConsistencySupport.Composition comp = getComposition(mealD3R1Id);
        Long grechkaSnap = comp.itemId("ЭК Гречка");
        Long tushSnap = comp.itemId("ЭК Тушёнка");
        Long solSnap = comp.itemId("ЭК Соль");
        assertThat(grechkaSnap).as("GET composition вернул снепшот-строки рецепта").isNotNull();
        assertThat(tushSnap).isNotNull();
        assertThat(solSnap).isNotNull();

        putComposition(mealD3R1Id, List.of(
                itemDto(grechkaSnap, "SCALED", null, "1.5"),
                itemDto(tushSnap, "RECIPE", null, null),
                itemDto(solSnap, "EXCLUDED", null, null),
                itemDto(sgushId, "EXTRA", "0.3", null)      // глобальный id — сервер привяжет к походу
        ), List.of(subDto(tushSnap, sgushId, "0.1")));      // цель — глобальный id

        // PUT создал снепшот Сгущёнки — карта снепшотов обязана быть свежей.
        loadSnapshotIds();
    }

    protected void loadSnapshotIds() {
        snap.clear();
        jdbc.query("SELECT id, snapshot_of FROM ingredients WHERE trip_id = ?", rs -> {
            snap.put(rs.getLong(2), rs.getLong(1));
        }, tripId);
    }

    protected Long snapshotOf(Long globalId) {
        Long s = snap.get(globalId);
        assertThat(s).as("trip-снепшот продукта %d обязан существовать (V20)", globalId).isNotNull();
        return s;
    }

    // ==================== HTTP-хелперы ====================

    protected MvcResult getTrip(String path) throws Exception {
        return mockMvc.perform(get("/api/v1/trips/" + tripId + path)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
    }

    protected Long firstCategoryId() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/product-categories")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode root = objectMapper.readTree(EconomicConsistencySupport.body(r));
        assertThat(root.isArray() && !root.isEmpty()).as("сид категорий product_categories").isTrue();
        return EconomicConsistencySupport.lng(root.get(0), "id", true);
    }

    protected Long createProduct(String name, String unit, Long categoryId, Integer kcal,
                               Integer pieceWeightG, String packSize, Boolean roundToPacks) throws Exception {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("name", name);
        req.put("unit", unit);
        req.put("categoryId", categoryId);
        if (kcal != null) req.put("kcalPer100g", kcal);
        if (pieceWeightG != null) req.put("pieceWeightG", pieceWeightG);
        if (packSize != null) req.put("packSize", new BigDecimal(packSize));
        if (roundToPacks != null) req.put("roundToPacks", roundToPacks);
        MvcResult r = mockMvc.perform(post("/api/v1/admin/products")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();
        return EconomicConsistencySupport.lng(objectMapper.readTree(EconomicConsistencySupport.body(r)), "id", true);
    }

    protected void setPrice(Long ingredientId, String price, String effectiveFrom) throws Exception {
        String body = String.format(
                "{\"ingredientId\":%d,\"pricePerUnit\":%s,\"effectiveFrom\":\"%s\",\"currency\":\"RUB\"}",
                ingredientId, price, effectiveFrom);
        mockMvc.perform(post("/api/v1/admin/ingredient-prices")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());
    }

    protected Long createRecipe(String name, int baseServings, int kcal, Map<Long, String> ingredients) throws Exception {
        List<Map<String, Object>> lines = new ArrayList<>();
        for (Map.Entry<Long, String> e : ingredients.entrySet()) {
            lines.add(Map.of("ingredientId", e.getKey(), "amount", new BigDecimal(e.getValue())));
        }
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("name", name);
        req.put("mealType", "BREAKFAST");
        req.put("baseServings", baseServings);
        req.put("caloriesPerServing", kcal);
        req.put("ingredients", lines);
        MvcResult r = mockMvc.perform(post("/api/v1/admin/recipes")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();
        return EconomicConsistencySupport.lng(objectMapper.readTree(EconomicConsistencySupport.body(r)), "id", true);
    }

    protected Long createTrip(String name, LocalDate start, LocalDate end, int people) throws Exception {
        String body = String.format(
                "{\"name\":\"%s\",\"startDate\":\"%s\",\"endDate\":\"%s\",\"defaultPeople\":%d}",
                name, start, end, people);
        MvcResult r = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return EconomicConsistencySupport.lng(objectMapper.readTree(EconomicConsistencySupport.body(r)), "id", true);
    }

    protected Long dayIdByDate(LocalDate date) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/trips/" + tripId)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
        for (JsonNode d : EconomicConsistencySupport.arr(objectMapper.readTree(EconomicConsistencySupport.body(r)), "days", "поход", EconomicConsistencySupport.body(r))) {
            if (date.toString().equals(EconomicConsistencySupport.text(d, "dayDate", true))) {
                return EconomicConsistencySupport.lng(d, "id", true);
            }
        }
        throw new AssertionError("День не найден: " + date);
    }

    protected Long addMeal(Long dayId, String mealType, Long recipeId, Integer peopleOverride) throws Exception {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("mealType", mealType);
        req.put("recipeId", recipeId);
        if (peopleOverride != null) req.put("peopleOverride", peopleOverride);
        MvcResult r = mockMvc.perform(post("/api/v1/trips/" + tripId + "/days/" + dayId + "/meals")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn();
        return EconomicConsistencySupport.lng(objectMapper.readTree(EconomicConsistencySupport.body(r)), "id", true);
    }

    protected Long recipeSnapshotId(Long globalRecipeId) {
        Long id = jdbc.queryForObject(
                "SELECT id FROM recipes WHERE trip_id = ? AND snapshot_of = ?", Long.class, tripId, globalRecipeId);
        assertThat(id).as("trip-снепшот рецепта %d", globalRecipeId).isNotNull();
        return id;
    }

    protected EconomicConsistencySupport.Composition getComposition(Long mealId) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/trips/" + tripId + "/meals/" + mealId + "/composition")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
        return EconomicConsistencySupport.parseComposition(objectMapper.readTree(EconomicConsistencySupport.body(r)));
    }

    protected void putComposition(Long mealId, List<Map<String, Object>> items,
                                List<Map<String, Object>> substitutions) throws Exception {
        Map<String, Object> req = Map.of("items", items, "substitutions", substitutions);
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/meals/" + mealId + "/composition")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk());
    }

    protected Map<String, Object> itemDto(Long ingredientId, String state, String amount, String ratio) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ingredientId", ingredientId);
        m.put("state", state);
        if (amount != null) m.put("amount", new BigDecimal(amount));
        if (ratio != null) m.put("ratio", new BigDecimal(ratio));
        return m;
    }

    protected Map<String, Object> subDto(Long fromId, Long toId, String ratio) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fromIngredientId", fromId);
        m.put("toIngredientId", toId);
        m.put("ratio", new BigDecimal(ratio));
        return m;
    }

    protected void setOverride(Long ingredientId, String actualPrice) throws Exception {
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/price-overrides/" + ingredientId)
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new TripPriceOverrideRequest(new BigDecimal(actualPrice), "чек E2E-ECON"))))
                .andExpect(status().isOk());
    }

    protected void assertZero(String message, String sql, Object... args) {
        Integer cnt = jdbc.queryForObject(sql, Integer.class, args);
        assertThat(cnt == null ? -1 : cnt).as(message).isZero();
    }

}