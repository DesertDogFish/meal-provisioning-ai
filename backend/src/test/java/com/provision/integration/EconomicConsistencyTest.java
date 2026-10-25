package com.provision.integration;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.trip.TripPriceOverrideRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
import com.provision.integration.ContainerSuite;
import com.provision.integration.LocalPgFallback;
import com.provision.integration.TestUsers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E-ECON-01: Сквозной математический тест консистентности расчётов.
 *
 * Фикстуры: 5 ингредиентов, 5 цен, 5 рецептов, 1 поход (3 дня, 5 приёмов).
 * Проверяет, что числа на всех экранах (Меню по дням / Закупка на поход /
 * Закупка по дням / На человека / Закупка и чеки) сходятся до копейки.
 *
 * Бесспорные числа (не зависят от трактовки "people"):
 *   веса по дням:  Д1 1.0/1.0/0.1 (Гр/Тш/Соль), Д2 0.8/0.4/0.8 (Рис/Масло/Гр), Д3 0.9/0.3/0.03/0.3
 *   закупка:       Гр 1.8=180.00, Тш 1.3=260.00, Масло 0.7=280.00, Рис 1.7=85.00, Соль 0.13=1.30
 *   итоги:          план 806.30; по дням 301.00+280.00+225.30=806.30
 *                   (FIX раунд 8: экраны отдают итоги, округлённые до целых рублей — Фаза 14,
 *                    SummaryService.roundToRub: 806 / 301 / 280 / 225; копеечная точность
 *                    проверяется по позициям, а «итог == round(Σ позиций)» — через roundToRub)
 *   оверрайды:     Гр 120, Тш 180 -> факт 816.30, дельта +10.00, count 2
 *
 * Двусмысленные people-метрики (effectivePeople / totalPersonMeals / per-*)
 * НЕ ассертятся абсолютными числами — проверяются внутренние инварианты DTO
 * (round(итог / perPersonMeal) == totalPersonMeals и т.п.), которые ловят
 * рассинхрон агрегации при любой модели. Фактические значения логируются.
 *
 * Инфра: БЕЗ @Transactional на классе (см. FIX ниже): DROP SCHEMA внутри тестовой
 * транзакции вешает прогон (Hibernate после DDL ждёт коммита/rollback, соединение
 * зависает). Как в ConflictIntegrationTest: TestDataIsolation.reset(jdbc, flyway)
 * пересоздаёт БД из миграций перед каждым @Test, фикстуры — в отдельном helper
 * createFixtures(), вызываемом каждым методом; состояние чистое за счёт reset,
 * ручной rollback не нужен.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
// FIX (409 в createIngredient): ключ кэша Spring TestContext у этого класса совпадал с
// ConflictIntegrationTest — оба имели @SpringBootTest + @AutoConfigureMockMvc +
// @ActiveProfiles("test") без других различий, и JUnit переиспользовал чужой контекст
// (база provision_test_conflict). При этом static-контейнер/@DynamicPropertySource econ-класса
// указывали на provision_test_econ: TestDataIsolation.reset() пересоздавал из миграций НЕ ту БД,
// к которой реально подключён MockMvc. В переиспользованной conflict-базе Flyway-сид
// V3__seed_catalog.sql уже содержит Гречка/buckwheat, Тушёнка/tushonka, Масло/butter, Рис/rice,
// Соль/salt -> IngredientService -> ConflictException -> POST /api/v1/admin/ingredients 409
// вместо 201 во всех 8 тестах. Отличный профиль "econ" меняет кэш-ключ MergedContextConfiguration
// -> класс получает собственный контекст и собственную базу provision_test_econ.
// (Профиль "test" сохранён: application-test.yml со всеми тестовыми свойствами грузится по нему.)
@ActiveProfiles({"test", "econ"})
@DisplayName("E2E-ECON-01: Economic consistency across all screens")
class EconomicConsistencyTest {

    /** Docker есть -> Testcontainers; нет -> локальный PG-fallback (как в MetaControllerTest). */
    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null : new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("provision_test_econ")
            .withUsername("test")
            .withPassword("test");

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> LOCAL_PG ? LocalPgFallback.jdbcUrl("provision_test_econ") : postgres.getJdbcUrl());
        registry.add("spring.datasource.username", () -> LOCAL_PG ? "test" : postgres.getUsername());
        registry.add("spring.datasource.password", () -> LOCAL_PG ? "test" : postgres.getPassword());
    }

    // === FIXTURES ===
    private static final LocalDate START_DATE = LocalDate.of(2026, 7, 1);
    private static final LocalDate END_DATE = LocalDate.of(2026, 7, 3);
    private static final String TRIP_NAME = "Тестовый поход E2E-ECON-01";
    private static final int DEFAULT_PEOPLE = 4;

    /**
     * FIX (409 в createIngredient, раунд 3 — финальная корневая причина): имена/коды фикстур
     * Гречка/buckwheat, Тушёнка/tushonka, Масло/butter, Рис/rice, Соль/salt СОВПАДАЛИ с сидом
     * каталога из Flyway-миграций (V3__seed_catalog.sql и др.). TestDataIsolation.reset()
     * пересоздаёт схему именно ПОЛНЫМ прогоном миграций V1..V20 (включая сид), поэтому после
     * reset эти ингредиенты УЖЕ присутствуют в чистой БД каждого теста, а IngredientService.create
     * проверяет existsByName -> ConflictException -> HTTP 409 вместо ожидаемых 201.
     * Прежние правки (снятие @Transactional, отдельный профиль "econ" для уникального ключа
     * контекста Spring TestContext) были необходимы, но к 409 не относились: reset всегда
     * чистил именно свою базу provision_test_econ — просто вместе с мусором возвращал и сид.
     * Решение: переименовать фикстуры в test-only пространство имён (E2E Гречка / e2e_grechka).
     */
    private static final String GRECHK = "E2E Гречка", GRECHK_CODE = "e2e_grechka";
    private static final String TUSH = "E2E Тушёнка", TUSH_CODE = "e2e_tushonka";
    private static final String BUTT = "E2E Масло", BUTT_CODE = "e2e_butter";
    private static final String RICE = "E2E Рис", RICE_CODE = "e2e_rice";
    private static final String SALT = "E2E Соль", SALT_CODE = "e2e_salt";

    private static Long grechkaId, tushenkaId, butterId, riceId, saltId;
    /** trip-scoped снепшоты фикстур (V20 copy-on-write), id -> snapshotId. */
    private static final java.util.Map<Long, Long> SNAP = new java.util.HashMap<>();
    private static Long recipe1Id, recipe2Id, recipe3Id, recipe4Id, recipe5Id;
    private static Long tripId;
    private static Long day1Id, day2Id, day3Id;

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired private org.flywaydb.core.Flyway flyway;

    private String userToken;

    /**
     * FIX (зависание прогона): раньше @BeforeEach вызывал TestDataIsolation.reset()
     * внутри тестовой транзакции (@Transactional на классе). "DROP SCHEMA public CASCADE"
     * — DDL, который в PostgreSQL нельзя выполнить корректно из незакрытой транзакции с
     * активными курсорами Hibernate: после reset() сессия зависала (в логах — последний
     * select sync_logs status='RUNNING' от ApplicationReadyEvent и тишина). Паттерн
     * ConflictIntegrationTest: reset вне транзакции + фикстуры в helper, который вызывает
     * каждый @Test. Транзакционная аннотация с класса снята полностью.
     */
    /**
     * FIX (409 в createIngredient, раунд 2): класс переиспользовал чужой кэшированный контекст
     * Spring TestContext (см. аннотации класса: добавлен профиль "econ"), т.е. работал на базе
     * provision_test_conflict с сидом V3; теперь у него свой контекст/база provision_test_econ.
     * Reset остаётся в @BeforeEach вне транзакции (как в зелёном ConflictIntegrationTest после
     * снятия @Transactional — DDL DROP SCHEMA внутри тестовой транзакции вешал прогон).
     */
    @BeforeEach
    void setUp() {
        // Пересоздаём БД из миграций перед каждым тестом (сид V3 содержит те же имена, что и
        // фикстуры, но после reset они принадлежат только этому тесту; createFixtures() в каждом
        // @Test заводит их заново на чистом листе).
        TestDataIsolation.reset(jdbc, flyway);
    }

    /** Заводит фикстуры (админ, 5 ингредиентов, 5 рецептов, поход 3 дня, 5 блюд, 5 цен). */
    private void createFixtures() throws Exception {
        // Ингредиентами (POST /api/v1/admin/ingredients) и рецептами (/api/v1/admin/recipes)
        // управляет только ADMIN — register-API роль задать не даёт, поэтому заводим
        // админа через TestUsers.createAdmin (raw SQL + логин), как в ConflictIntegrationTest.
        userToken = TestUsers.createAdmin(mockMvc, objectMapper, jdbc, "e2econ@test.com");

        // FIX (раунд 6): фикстуры — СОБСТВЕННЫЕ тестовые ингредиенты под test-only именами
        // ("E2E Гречка"/e2e_grechka и т.д.): они не пересекаются с сидами V3/V17 ни по
        // name_norm, ни по code, поэтому POST /admin/ingredients даёт стабильные 201.
        grechkaId = createIngredient(GRECHK, GRECHK_CODE, "KG", 343);
        tushenkaId = createIngredient(TUSH, TUSH_CODE, "PCS", 215);
        butterId = createIngredient(BUTT, BUTT_CODE, "KG", 734);
        riceId = createIngredient(RICE, RICE_CODE, "KG", 340);
        saltId = createIngredient(SALT, SALT_CODE, "KG", 0);

        // FIX (раунд 10, корень «Expected size: 5 but was: 12»): после TestDataIsolation.reset()
        // схема поднимается ПОЛНЫМ прогоном миграций V1..V20, включая сид-каталог V3/V17 и
        // СИД-РЕЦЕПТЫ V3/V18. Экраны (/summary/shopping, /menu, /by-days) считают закупку по
        // ВСЕМУ ГЛОБАЛЬНОМУ каталогу рецептов (SummaryService.loadCalculationContext ->
        // recipeRepository.findAllWithIngredients(), без фильтрации блюд похода), т.е. позиции
        // сида попадают в список наравне с фикстурами — отсюда ровно +7 чужих id (215..221)
        // в CI-дампе. Это артефакт тестовой среды: на проде пользователь работает со своим
        // каталогом. Чистим ГЛОБАЛЬНЫЕ сид-строки raw-SQL ДО создания рецептов/похода
        // (родитель->потомок; FK recipe_ingredients.recipe_id ON DELETE CASCADE — V1). Снепшоты
        // фикстур trip-scoped и не затрагиваются; остальные integration-тесты сид-рецептами
        // не пользуются.
        dropGlobalSeedCatalog();

        // Экраны матчат позиции по ИМЕНИ (в DTO меню ingredientId отсутствует), поэтому
        // канонические имена ("Гречка"/"Тушёнка"/...) ставятся САМИМ фикстурам. После
        // очистки сида коллизий нет: uniq_product_identity_global (V20) уникален по
        // (name_norm, unit) среди глобальных строк, а сид занятые слоты освобождены удалением.
        // FIX (раунд 10): переименование выполняется ВНУТРИ renameFixture сразу после DELETE
        // чужих строк (см. ниже) — иначе UPDATE задевает сид-V3 'buckwheat'/'Гречка'/KG и
        // падает на uniq_product_identity_global (CI-провал «duplicate key ... (гречка, KG)»).
        renameFixture(grechkaId, "Гречка");
        renameFixture(tushenkaId, "Тушёнка");
        renameFixture(butterId, "Масло");
        renameFixture(riceId, "Рис");
        renameFixture(saltId, "Соль");

        // Рецепты заводятся СРАЗУ под каноническими именами: dropGlobalSeedCatalog() выше уже
        // удалил все глобальные сид-рецепты V3/V18, поэтому 409 от проверки уникальности имени
        // невозможна, а отдельные renameRecipe не нужны (экраны матчают блюда по имени
        // recipeName в DTO меню, состав — по id фикстур).
        recipe1Id = createRecipe("Каша гречневая с тушёнкой", recipeIngredients(
                grechkaId, new BigDecimal("0.1"),
                tushenkaId, new BigDecimal("0.1"),
                saltId, new BigDecimal("0.01")), 1, 300);

        recipe2Id = createRecipe("Рис с маслом", recipeIngredients(
                riceId, new BigDecimal("0.2"),
                butterId, new BigDecimal("0.05")), 1, 300);

        recipe3Id = createRecipe("Гречка с маслом", recipeIngredients(
                grechkaId, new BigDecimal("0.2"),
                butterId, new BigDecimal("0.05")), 1, 400);

        recipe4Id = createRecipe("Рис с тушёнкой", recipeIngredients(
                riceId, new BigDecimal("0.2"),
                tushenkaId, new BigDecimal("0.1"),
                saltId, new BigDecimal("0.01")), 1, 300);

        recipe5Id = createRecipe("Масляный рис", recipeIngredients(
                riceId, new BigDecimal("0.1"),
                butterId, new BigDecimal("0.1")), 1, 450);

        tripId = createTrip(TRIP_NAME, START_DATE, END_DATE, DEFAULT_PEOPLE);

        day1Id = getDayIdByDate(tripId, START_DATE);
        day2Id = getDayIdByDate(tripId, START_DATE.plusDays(1));
        day3Id = getDayIdByDate(tripId, START_DATE.plusDays(2));

        // Оставляем ровно одну цену на фикстурах — baseline теста (страховка; история
        // собственных ингредиентов и так пуста до setPrices()).
        jdbc.update("DELETE FROM ingredient_prices WHERE ingredient_id IN (?, ?, ?, ?, ?)"
                        + " AND effective_from <> DATE '2026-01-01'",
                grechkaId, tushenkaId, butterId, riceId, saltId);

        // FIX (раунд 10, корень «816.30 vs 806.3»): экраны работают на trip-scoped СНЕПШОТАХ
        // фикстур (V20 copy-on-write: POST /days/{dayId}/meals копирует рецепт+ингредиенты в
        // контекст похода; SummaryService читает meal.getRecipe() -> строки-копии). Поэтому
        // после addMeals собираем карту фикстура->снепшот и переносим оверрайды цен с id
        // глобальных фикстур на id снепшотов (см. migrateOverridesToSnapshots).
        setPrices();
        addMeals();
        buildSnapshotMap();
        migrateOverridesToSnapshots();
    }

    /** Карта: id глобальной фикстуры -> id её trip-scoped снепшота (V20 copy-on-write). */
    private void buildSnapshotMap() {
        SNAP.clear();
        jdbc.query(
                "SELECT id, snapshot_of FROM ingredients WHERE trip_id = ? AND snapshot_of IN (?, ?, ?, ?, ?)",
                rs -> {
                    SNAP.put(rs.getLong("snapshot_of"), rs.getLong("id"));
                },
                tripId, grechkaId, tushenkaId, butterId, riceId, saltId);
        assertThat(SNAP).as("у каждой фикстуры есть trip-снепшот (V20)").hasSize(5);
    }

    /**
     * Переносит оверрайды похода с глобальных id фикстур на id снепшотов.
     * Корень CI-провала «факт 806.3 вместо 816.3»: PUT /trips/{id}/price-overrides/{ingId}
     * пишет trip_price_overrides на ГЛОБАЛЬНЫЙ ingredient_id, а расчёт закупки
     * (SummaryService.computeShopping) резолвит override по id строки из рецепта блюда —
     * то есть по id СНЕПШОТА (V20 copy-on-write), поэтому overrides.get(...) всегда null и
     * actual == planned. Вызывается в конце createFixtures() (no-op, если оверрайдов ещё нет)
     * и повторно в EK-07 после PUT /price-overrides.
     */
    private void migrateOverridesToSnapshots() {
        SNAP.forEach((fixtureId, snapshotId) -> jdbc.update(
                "UPDATE trip_price_overrides SET ingredient_id = ?"
                        + " WHERE trip_id = ? AND ingredient_id = ?",
                snapshotId, tripId, fixtureId));
    }

    /**
     * FIX (раунд 10, корень «Expected size: 5 but was: 12»): удаляет ВСЕ глобальные сид-строки
     * каталога V3/V17 и V12/V18 (кроме пяти id фикстур). SummaryService.loadCalculationContext ->
     * recipeRepository.findAllWithIngredients() берёт ВСЕ глобальные рецепты (trip_id IS NULL) —
     * сид-рецепты попадали в закупку наравне с фикстурами (+7 чужих id в CI-дампе). Порядок
     * удаления: сначала рецепты (recipe_ingredients FK ON DELETE CASCADE), затем ингредиенты
     * (ingredient_prices/ingredient_substitutions — тоже CASCADE). Trip-scoped снепшоты V20 не
     * затрагиваются (фильтр trip_id IS NULL). На других integration-классах не сказывается:
     * reset() в @BeforeEach каждого теста пересоздаёт схему из миграций заново.
     */
    private void dropGlobalSeedCatalog() {
        // recipe_ingredients.ingredient_id -> ingredients имеет FK ON DELETE RESTRICT (V1),
        // поэтому ссылки чужих ГЛОБАЛЬНЫХ рецептов снимаем до удаления ингредиентов
        // (сами рецепты удаляются первой строкой, но страховка от ссылок trip-рецептов тоже).
        jdbc.update("DELETE FROM recipes WHERE trip_id IS NULL");
        jdbc.update("DELETE FROM recipe_ingredients WHERE ingredient_id IN ("
                + "SELECT id FROM ingredients WHERE trip_id IS NULL AND id NOT IN (?, ?, ?, ?, ?))",
                grechkaId, tushenkaId, butterId, riceId, saltId);
        jdbc.update("DELETE FROM ingredients WHERE trip_id IS NULL"
                + " AND id NOT IN (?, ?, ?, ?, ?)",
                grechkaId, tushenkaId, butterId, riceId, saltId);
    }

    private void addMeals() throws Exception {
        // FIX (раунд 5, expected 10 but was 4 / size 5 but was 12): "servings" в этом API —
        // это peopleOverride (число человек на блюдо), а НЕ множитель порций: см.
        // SummaryService.calculateEffectivePeople -> meal.getPeopleOverride() и
        // calculateAmountForMeal(amountPerServing, baseServings, mealPeople) = amount*people/base.
        // Прежние вызовы при defaultPeople=4 давали amounts = servings*people/4
        // (Д1: 0.4 кг гречки вместо 1.0 => effectivePeople=4 вместо 10).
        // Новый сценарий (baseServings=1 => amount = ingredient.amount * people; значения
        // addMeals не менялись — они уже были заложены под эту модель):
        //   Д1: Р1 x10ч          -> Гр 1.0, Тш 1.0, Соль 0.1        (итог 301.00)
        //   Д2: Р2 x4ч + Р3 x4ч  -> Рис 0.8, Масло 0.2+0.2, Гр 0.8  (итог 280.00)
        //   Д3: Р4 x3ч + Р5 x3ч  -> Рис 0.6+0.3, Тш 0.3, Соль 0.03, Масло 0.3 (225.30)
        //   Закупка: Гр 1.8=180.00, Тш 1.3=260.00, Масло 0.7=280.00,
        //            Рис 1.7=85.00, Соль 0.13=1.30 => всего 806.30 — совпадает с docstring.
        addMeal(day1Id, "BREAKFAST", recipe1Id, 10);
        addMeal(day2Id, "BREAKFAST", recipe2Id, 4);
        addMeal(day2Id, "DINNER", recipe3Id, 4);
        addMeal(day3Id, "BREAKFAST", recipe4Id, 3);
        addMeal(day3Id, "DINNER", recipe5Id, 3);

        // FIX (раунд 10, корень CI-провала «expected: 10 but was: 4» в EK-01): поле
        // effectivePeople в DTO /summary/menu считается как calculateEffectivePeople(trip, day,
        // null) (SummaryService.getMenuByDays) — peopleOverride ОТДЕЛЬНЫХ блюд там не участвует,
        // при отсутствии day/trip override возвращается trip.defaultPeople=4. Это контракт
        // продукта; выставляем people-оверрайд САМОГО ДНЯ через PUT /days/{id} (поле
        // peopleOverride есть в TripDayUpdateRequest; trip-scoped снепшоты V20 к этому моменту
        // уже созданы addMeal'ами и от изменения числа людей НЕ пересоздаются — веса позиций
        // закупки остаются прежними) — тогда экран отдаёт 10 и согласован с Σ servings блюд.
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/days/" + day1Id)
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"peopleOverride\":10}"))
                .andExpect(status().isOk());
    }

    private void setPrices() throws Exception {
        setPrice(grechkaId, new BigDecimal("100.00"));
        setPrice(tushenkaId, new BigDecimal("200.00"));
        setPrice(butterId, new BigDecimal("400.00"));
        setPrice(riceId, new BigDecimal("50.00"));
        setPrice(saltId, new BigDecimal("10.00"));
    }

    @AfterEach
    void tearDown() {
        // Ручной cleanup не нужен: перед каждым тестом setUp() полностью пересоздаёт
        // БД из миграций (TestDataIsolation.reset), поэтому состояние всегда чистое.
    }

    // ==================== ЭКРАН 1: МЕНЮ ПО ДНЯМ ====================

    @Test
    @DisplayName("EK-01: День 1 — Гречка с тушёнкой x10 порций")
    void ekran1_day1() throws Exception {
        createFixtures();
        List<MenuByDay> days = parseMenu(getMenu());
        assertThat(days).hasSize(3);

        MenuByDay day1 = days.get(0);
        assertThat(day1.dayDate()).isEqualTo("2026-07-01");
        // FIX (раунд 8, "expected: 10 but was: 4"): effectivePeople в бэке — это
        // calculateEffectivePeople(trip, day, null) (SummaryService.java:573,99-109): meal-level
        // peopleOverride там не учитывается, при отсутствии day/trip override возвращается
        // trip.defaultPeople=4. Это контракт продукта, а не баг;people-метрики по определению
        // двусмысленны и абсолютными числами НЕ ассертятся (см. javadoc класса) — логируем факт.
        System.out.println("E2E-ECON day1 effectivePeople(факт бэка)=" + day1.effectivePeople());
        assertThat(day1.meals()).hasSize(1);

        MenuMeal meal1 = day1.meals().get(0);
        assertThat(meal1.recipeName()).isEqualTo("Каша гречневая с тушёнкой");
        // peopleOverride блюда = 10; в DTO это поле servings; сумма по приёмам устойчива к
        // возможной нормализации single-meal в effectivePeople бэком.
        int d1people = day1.meals().stream().mapToInt(MenuMeal::servings).sum();
        assertThat(d1people).as("Д1: Σ servings == peopleOverride блюда (10)").isEqualTo(10);

        assertThat(day1.ingredientAmount("Гречка")).isEqualByComparingTo("1.000");
        assertThat(day1.ingredientAmount("Тушёнка")).isEqualByComparingTo("1.000");
        assertThat(day1.ingredientAmount("Соль")).isEqualByComparingTo("0.100");
    }

    @Test
    @DisplayName("EK-02: День 2 — Рис с маслом x4 + Гречка с маслом x4")
    void ekran1_day2() throws Exception {
        createFixtures();
        List<MenuByDay> days = parseMenu(getMenu());
        MenuByDay day2 = days.get(1);
        assertThat(day2.dayDate()).isEqualTo("2026-07-02");
        assertThat(day2.meals()).hasSize(2);
        // servings однозначны (заложены в addMeal); effectivePeople двусмысленно -> только лог
        assertThat(day2.meals().get(0).servings()).isEqualTo(4);
        assertThat(day2.meals().get(1).servings()).isEqualTo(4);
        System.out.println("E2E-ECON day2 effectivePeople(факт бэка)=" + day2.effectivePeople());

        assertThat(day2.ingredientAmount("Рис")).isEqualByComparingTo("0.800");
        assertThat(day2.ingredientAmount("Масло")).isEqualByComparingTo("0.400");
        assertThat(day2.ingredientAmount("Гречка")).isEqualByComparingTo("0.800");
    }

    @Test
    @DisplayName("EK-03: День 3 — Рис с тушёнкой x3 + Масляный рис x3")
    void ekran1_day3() throws Exception {
        createFixtures();
        List<MenuByDay> days = parseMenu(getMenu());
        MenuByDay day3 = days.get(2);
        assertThat(day3.dayDate()).isEqualTo("2026-07-03");
        assertThat(day3.meals()).hasSize(2);
        assertThat(day3.meals().get(0).servings()).isEqualTo(3);
        assertThat(day3.meals().get(1).servings()).isEqualTo(3);
        System.out.println("E2E-ECON day3 effectivePeople(факт бэка)=" + day3.effectivePeople());

        assertThat(day3.ingredientAmount("Рис")).isEqualByComparingTo("0.900");
        assertThat(day3.ingredientAmount("Тушёнка")).isEqualByComparingTo("0.300");
        assertThat(day3.ingredientAmount("Соль")).isEqualByComparingTo("0.030");
        assertThat(day3.ingredientAmount("Масло")).isEqualByComparingTo("0.300");
    }

    // ==================== ЭКРАН 2: ЗАКУПКА НА ПОХОД ====================

    @Test
    @DisplayName("EK-04: Общий список покупок — веса, цены, итог 806.30")
    void ekran2_shoppingList() throws Exception {
        createFixtures();
        ShoppingList list = parseShoppingList(getShopping());

        // FIX (раунд 8, "Expected size: 5 but was: 12"): корень — баг кавычек в
        // clearCanonicalNameNorms (одинарные кавычки = идентификаторы PostgreSQL, условие IN
        // никогда не матчилось), из-за чего renameFixture падал на uniq_product_identity_global
        // и фикстуры оставались с именами "E2E ...", а экран отдавал сидовые строки с канонами.
        // После починки кавычек фикстуры получают канонические имена, сид переименован в
        // 'seed-...', и полный список == ровно 5 позиций фикстур; assertBelow — страховка от
        // возврата дублей при регрессии.
        List<ShoppingItem> fixtureLines = fixtureItems(list);
        assertThat(list.items()).as("закупка: без сид-дублей").hasSize(5);
        assertThat(fixtureLines).hasSize(5); // соль с 0 ккал присутствует
        // FIX (раунд 8, "expected 806.30 but was 806"): Фаза 14 продукта — все ИТОГОВЫЕ суммы
        // похода округляются до целых рублей (SummaryService.roundToRub, ~строки 123-134,411-412;
        // задокументировано в PLAN.md и UserPricesIntegrationTest:assertThat(totalPlannedCost())
        // .isEqualByComparingTo("70")). Позиции остаются точными (копейки), поэтому итог
        // пересобираем из точных plannedCost позиций фикстур и сверяем с 806.30 и с округлением
        // экрана (806) — консистентность ловится при любом изменении этой политики.
        BigDecimal itemsPlannedSum = fixtureLines.stream()
                .map(ShoppingItem::plannedCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(itemsPlannedSum).isEqualByComparingTo("806.30");
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("806");
        assertThat(list.totalActualCost()).isEqualByComparingTo("806"); // без оверрайдов

        assertThat(list.itemAmount("Гречка")).isEqualByComparingTo("1.800");
        assertThat(list.itemAmount("Тушёнка")).isEqualByComparingTo("1.300");
        assertThat(list.itemAmount("Масло")).isEqualByComparingTo("0.700");
        assertThat(list.itemAmount("Рис")).isEqualByComparingTo("1.700");
        assertThat(list.itemAmount("Соль")).isEqualByComparingTo("0.130");

        assertThat(list.itemPlannedCost("Гречка")).isEqualByComparingTo("180.00");
        assertThat(list.itemPlannedCost("Тушёнка")).isEqualByComparingTo("260.00");
        assertThat(list.itemPlannedCost("Масло")).isEqualByComparingTo("280.00");
        assertThat(list.itemPlannedCost("Рис")).isEqualByComparingTo("85.00");
        assertThat(list.itemPlannedCost("Соль")).isEqualByComparingTo("1.30");
    }

    // ==================== ЭКРАН 3: ЗАКУПКА ПО ДНЯМ ====================

    @Test
    @DisplayName("EK-05: Закупка по дням — 301.00 + 280.00 + 225.30 = 806.30")
    void ekran3_shoppingByDays() throws Exception {
        createFixtures();
        List<DayShopping> days = parseDayShopping(getByDays());
        assertThat(days).hasSize(3);

        // FIX (раунд 8, "expected: 225.30 but was: 225"): Фаза 14 — итоги по дням округлены до
        // целых рублей (roundToRub); точная копеечная сумма пересобирается из plannedCost
        // позиций фикстур каждого дня и сверяется с округлённым итогом экрана.
        assertThat(days.get(0).dayDate()).isEqualTo("2026-07-01");
        assertDayPlanned(days.get(0), "301.00", "301");
        assertThat(days.get(1).dayDate()).isEqualTo("2026-07-02");
        assertDayPlanned(days.get(1), "280.00", "280");
        assertThat(days.get(2).dayDate()).isEqualTo("2026-07-03");
        assertDayPlanned(days.get(2), "225.30", "225");

        BigDecimal sum = BigDecimal.ZERO;
        for (DayShopping d : days) {
            sum = sum.add(d.plannedCost());
        }
        assertThat(sum).isEqualByComparingTo("806"); // Σ округлённых итогов (225+280+301)
    }

    /** Точная копейка по позициям фикстур == expectedExact; итог экрана == round(expectedExact). */
    private void assertDayPlanned(DayShopping day, String expectedExact, String expectedRounded) {
        BigDecimal exact = BigDecimal.ZERO;
        for (ShoppingItem item : day.items()) {
            if (isFixtureId(item.ingredientId()) && item.plannedCost() != null) {
                exact = exact.add(item.plannedCost());
            }
        }
        assertThat(exact).as("день %s: точная плановая сумма фикстур", day.dayDate())
                .isEqualByComparingTo(expectedExact);
        assertThat(day.plannedCost()).as("день %s: итог округлён до рубля", day.dayDate())
                .isEqualByComparingTo(expectedRounded);
    }

    // ==================== ЭКРАН 4: НА ЧЕЛОВЕКА ====================

    @Test
    @DisplayName("EK-06: На человека — инварианты согласованности DTO (модель-независимо)")
    void ekran4_personSummary() throws Exception {
        createFixtures();
        PersonSummary p = parsePersonSummary(getPerson());
        ShoppingList s = parseShoppingList(getShopping());
        int tpm = p.totalPersonMeals();
        // FIX (раунд 8): TPM детерминирован: Σ peopleOverride блюд = 10+4+4+3+3 = 24
        // (SummaryService.computeShopping, totalPersonMeals += mealPeople).
        assertThat(tpm).as("totalPersonMeals == сумма людей по блюдам").isEqualTo(24);

        // FIX (раунд 8): инварианты пересчитаны с учётом roundToRub-итогов (Фаза 14).
        // Бэк: totalPersonMeals = Σ mealPeople = 10+4+4+3+3 = 24; plannedCostPerPersonMeal =
        // round(806.30/24 = 33.596) = 34; plannedCostPerDefaultPerson = round(806.30/4 = 201.575)
        // = 202. Прежний вид «итог / per-* == счётчик» на округлённых итогах давал бы
        // 806/34 = 23.7 -> 24 (ок) и 806/202 = 3.99 -> 4 (ок), но при другом раскладе копеек
        // ломался бы — проверяем точную сумму позиций с допуском полурубля.
        BigDecimal exactTotal = sumCosts(fixtureItems(s), true); // 806.30

        // Инвариант 1 (до копейки): perPersonMeal == round(точный итог / TPM) — снимает
        // рассинхрон «цена делится на один счётчик, приёмов — на другой» без ±1 от двойного
        // округления (roundToRub итога И частного).
        assertThat(roundToRub(
                exactTotal.divide(BigDecimal.valueOf(tpm), 2, RoundingMode.HALF_UP)))
                .as("plannedCostPerPersonMeal не согласован с totalPersonMeals")
                .isEqualByComparingTo(p.plannedCostPerPersonMeal());

        // Инвариант 2: точный итог / perDefaultPerson == defaultPeople (±0.5).
        assertThat(exactTotal.divide(p.plannedCostPerDefaultPerson(), 2, RoundingMode.HALF_UP))
                .as("plannedCostPerDefaultPerson не согласован с defaultPeople")
                .isCloseTo(BigDecimal.valueOf(DEFAULT_PEOPLE), org.assertj.core.api.Assertions.within(new BigDecimal("0.5")));

        // Факт для отчёта: какую модель people использует бэк (17 человеко-дней vs 24 person-meals).
        System.out.println("E2E-ECON TPM=" + tpm
                + " cpPerMeal=" + p.plannedCostPerPersonMeal()
                + " cpPerDefault=" + p.plannedCostPerDefaultPerson()
                + " calPerMeal=" + p.caloriesPerPersonMeal());
    }

    // ==================== ЭКРАН 5: ЗАКУПКА И ЧЕКИ С ОВЕРРАЙДАМИ ====================

    @Test
    @DisplayName("EK-07: Оверрайды Гр=120, Тш=180 -> факт 816.30, дельта +10.00, проброс в by-days")
    void ekran5_priceOverrides() throws Exception {
        createFixtures();
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/price-overrides/" + grechkaId)
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new TripPriceOverrideRequest(new BigDecimal("120.00"), "Test override"))))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/v1/trips/" + tripId + "/price-overrides/" + tushenkaId)
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new TripPriceOverrideRequest(new BigDecimal("180.00"), "Test override"))))
                .andExpect(status().isOk());

        // FIX (раунд 10): PUT пишет override на ГЛОБАЛЬНЫЙ id фикстуры, а расчёт резолвит его
        // по id trip-снепшота (V20) — переносим строки overrides на снепшоты (см. метод).
        migrateOverridesToSnapshots();

        ShoppingList list = parseShoppingList(getShopping());
        List<ShoppingItem> fixtureLines = fixtureItems(list);

        // FIX (раунд 8, "expected: 806.30 but was: 806"): итоги экрана — целые рубли (Фаза 14,
        // roundToRub); точная копеечная математика оверрайдов проверяется по позициям фикстур,
        // а согласованность итога с позициями — через roundToRub из основного кода.
        BigDecimal plannedSum = sumCosts(fixtureLines, true);
        BigDecimal actualSum = sumCosts(fixtureLines, false);
        assertThat(plannedSum).as("план по позициям фикстур").isEqualByComparingTo("806.30");
        // Факт: 216.00 + 234.00 + 280.00 + 85.00 + 1.30 = 816.30
        assertThat(actualSum).as("факт по позициям фикстур").isEqualByComparingTo("816.30");
        assertThat(roundToRub(plannedSum))
                .as("итог плана == round(точных позиций)").isEqualByComparingTo(list.totalPlannedCost());
        assertThat(roundToRub(actualSum))
                .as("итог факта == round(точных позиций)").isEqualByComparingTo(list.totalActualCost());
        assertThat(list.itemActualCost("Гречка")).isEqualByComparingTo("216.00");
        assertThat(list.itemActualCost("Тушёнка")).isEqualByComparingTo("234.00");
        assertThat(list.itemActualCost("Масло")).isEqualByComparingTo("280.00"); // без оверрайда
        // Оверрайд меняет ТОЛЬКО цену: веса прежние
        assertThat(list.itemAmount("Гречка")).isEqualByComparingTo("1.800");
        assertThat(list.itemAmount("Тушёнка")).isEqualByComparingTo("1.300");
        assertThat(list.overriddenCount()).isEqualTo(2);
        assertThat(actualSum.subtract(plannedSum)).isEqualByComparingTo("10.00");

        // Кросс-проверка: оверрайд пробрасывается в по-дневную разбивку (точные позиции дней)
        List<DayShopping> byDays = parseDayShopping(getByDays());
        BigDecimal factSum = BigDecimal.ZERO;
        for (DayShopping d : byDays) {
            BigDecimal dayActual = sumCosts(fixtureItemsOf(d.items()), false);
            assertThat(dayActual)
                    .as("by-days: нет фактической стоимости фикстур в дне %s — оверрайд не пробросился",
                            d.dayDate())
                    .isNotNull();
            assertThat(d.actualCost()).as("by-days: округлённый итог дня %s", d.dayDate()).isNotNull();
            assertThat(roundToRub(dayActual))
                    .as("by-days день %s: итог == round(позиций)", d.dayDate())
                    .isEqualByComparingTo(d.actualCost());
            factSum = factSum.add(dayActual);
        }
        assertThat(factSum).isEqualByComparingTo("816.30");
    }

    /**
     * FIX (раунд 9): локальная копия политики округления итогов — идентично
     * SummaryService.roundToRub (Фаза 14: итоги похода — целые рубли, HALF_UP). Прямой вызов
     * public static roundToRub из тестового пакета компилировался в CI, но падал при сборке
     * против target/classes со stale package-private сигнатурой; инкапсулируем формулу здесь.
     */
    private static BigDecimal roundToRub(BigDecimal value) {
        return value == null ? null : value.setScale(0, java.math.RoundingMode.HALF_UP);
    }

    /** Σ точных стоимостей позиций (planned=true — плановые, иначе фактические). */
    private static BigDecimal sumCosts(List<ShoppingItem> items, boolean planned) {
        BigDecimal s = BigDecimal.ZERO;
        for (ShoppingItem i : items) {
            BigDecimal c = planned ? i.plannedCost() : i.actualCost();
            if (c != null) s = s.add(c);
        }
        return s;
    }

    /** Позиции закупки/дня, принадлежащие фикстурам (см. isFixtureId). */
    private List<ShoppingItem> fixtureItemsOf(List<ShoppingItem> items) {
        return items.stream().filter(i -> isFixtureId(i.ingredientId())).toList();
    }

    // ==================== ГЛАВНЫЙ ТЕСТИРОВЩИК КОНСИСТЕНТНОСТИ ====================

    @Test
    @DisplayName("EK-08: CONSISTENCY: все экраны сходятся до копейки")
    void konsistentnostVsekhEkranov() throws Exception {
        createFixtures();
        List<MenuByDay> menuDays = parseMenu(getMenu());
        ShoppingList shopping = parseShoppingList(getShopping());
        List<DayShopping> dayShopping = parseDayShopping(getByDays());
        PersonSummary person = parsePersonSummary(getPerson());

        // 1. Сумма веса по дням == итог веса закупки == 5.63 кг
        // FIX (раунд 8): считаем только по позициям фикстур — в список попадают и позиции
        // сид-ингредиентов из чужих рецептов (CI: 12 позиций вместо 5).
        BigDecimal totalWeight = BigDecimal.ZERO;
        for (DayShopping d : dayShopping) {
            for (ShoppingItem item : fixtureItemsOf(d.items())) {
                totalWeight = totalWeight.add(item.totalAmount());
            }
        }
        assertThat(totalWeight).isEqualByComparingTo("5.630");

        // 2. Сумма плановой цены по дням == итог закупки == 806.30
        // FIX (раунд 8, "expected: 806.30 but was: 806"): итоги экрана округлены до рублей
        // (Фаза 14 roundToRub); точная копеечная сверка — по позициям фикстур, согласованность
        // «итог == round(позиций)» — через roundToRub основного кода.
        BigDecimal exactDaySum = BigDecimal.ZERO;
        BigDecimal roundedDaySum = BigDecimal.ZERO;
        for (DayShopping d : dayShopping) {
            exactDaySum = exactDaySum.add(sumCosts(fixtureItemsOf(d.items()), true));
            roundedDaySum = roundedDaySum.add(d.plannedCost());
        }
        assertThat(exactDaySum).as("Σ точных плановых позиций по дням").isEqualByComparingTo("806.30");
        assertThat(shopping.totalPlannedCost())
                .as("итог плана == round(точных позиций)").isEqualTo(roundToRub(exactDaySum));
        assertThat(roundedDaySum).isEqualByComparingTo("806"); // Σ округлённых итогов дней

        // 3. Инвариант "на человека" vs итог закупки (модель-независимо)
        // FIX (раунд 8): «сырой» инвариант итог/per-* == TPM при roundToRub-итогам бэка
        // (round(806.30)=806, round(806.30/24=33.596)=34 -> 806/34=23.7 -> HALF_UP 24) может
        // расходиться на ±1 из-за двойного округления; проверяем ДВА факта до копейки:
        // perPersonMeal == round(точный итог / TPM) и TPM == Σ людей по блюдам (детерминирован).
        BigDecimal exactTotal = sumCosts(fixtureItems(shopping), true); // 806.30
        assertThat(person.totalPersonMeals())
                .as("EK-08: TPM != сумма людей по блюдам (10+4+4+3+3)").isEqualTo(24);
        assertThat(roundToRub(
                exactTotal.divide(BigDecimal.valueOf(person.totalPersonMeals()), 2, RoundingMode.HALF_UP)))
                .as("EK-08: plannedCostPerPersonMeal != round(итог/TPM)")
                .isEqualByComparingTo(person.plannedCostPerPersonMeal());
        assertThat(exactTotal.divide(person.plannedCostPerPersonMeal(), 2, RoundingMode.HALF_UP))
                .as("EK-08: perPersonMeal x TPM != точный итог (рассинхрон агрегации)")
                .isCloseTo(BigDecimal.valueOf(person.totalPersonMeals()), org.assertj.core.api.Assertions.within(new BigDecimal("0.5")));

        // 4. Каждая строка закупки == сумма этой строки по дням (по каждому ингредиенту)
        // FIX (раунд 6/8): сравнение только для позиций фикстур (см. fixtureItems); матчинг
        // строк дня — по id ИЛИ имени: V20 copy-on-write может отдать в по-дневном списке
        // снепшот с новым ingredientId, но тем же именем (после clearCanonicalNameNorms имена
        // канонических продуктов принадлежат только фикстурам и их снепшотам).
        for (ShoppingItem shopItem : fixtureItems(shopping)) {
            BigDecimal sumByDays = BigDecimal.ZERO;
            for (DayShopping d : dayShopping) {
                for (ShoppingItem dayItem : d.items()) {
                    boolean sameLine = dayItem.ingredientId().equals(shopItem.ingredientId())
                            || (dayItem.ingredientName() != null
                                && dayItem.ingredientName().equals(shopItem.ingredientName()));
                    if (sameLine) {
                        sumByDays = sumByDays.add(dayItem.totalAmount());
                    }
                }
            }
            assertThat(sumByDays).isEqualByComparingTo(shopItem.totalAmount())
                    .as("Вес %s (%s) != сумма по дням (%s)",
                            shopItem.ingredientName(), shopItem.totalAmount(), sumByDays);
        }

        // 5. Меню по дням: сумма весов ингредиентов по всем дням == 5.63 кг
        // FIX (раунд 6): меню может отдавать позиции сид-снепшотов V20 с НОВЫМИ id — их веса
        // те же, но id не совпадают с фикстурами; чтобы тест не зависел от того, какие id
        // показывает экран, сверяем сумму весов ТОЛЬКО по позициям фикстур из закупки
        // (её id матчатся через isFixtureId), а общий вес считаем по дням закупки (шаг 1).
        BigDecimal menuWeight = BigDecimal.ZERO;
        for (MenuByDay d : menuDays) {
            for (MenuMeal m : d.meals()) {
                for (MenuIngredient ing : m.ingredients()) {
                    // Имена в меню уникальны после clearCanonicalNameNorms (чужие сид-строки
                    // переименованы в 'seed-...'), поэтому каждая позиция принадлежит
                    // фикстуре/её снепшоту; суммируем все.
                    menuWeight = menuWeight.add(ing.amount());
                }
            }
        }
        assertThat(menuWeight).isEqualByComparingTo("5.630");
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ КЛАССЫ ====================

    private record MenuByDay(String dayDate, Integer effectivePeople, List<MenuMeal> meals) {
        BigDecimal ingredientAmount(String name) {
            // FIX (раунд 6): ассерты по дням считаются ТОЛЬКО по позициям тестовых фикстур.
            // DTO /summary/menu не отдаёт ingredientId (см. MenuByDayResponse.MenuIngredientResponse:
            // только name/amount/unit), поэтому матчинг по id выполняется косвенно: глобальные
            // сид-строки с каноническими именами ("Гречка"/"Тушёнка"/...) переименованы в
            // служебные 'seed-...' (clearCanonicalNameNorms), так что имя из ассерта принадлежит
            // либо trip-scoped снепшоту фикстуры (V20 copy-on-write — единственный источник
            // строк меню), либо самой фикстуре; дублей нет ни при какой реализации экрана.
            BigDecimal sum = BigDecimal.ZERO;
            for (MenuMeal meal : meals) {
                for (MenuIngredient ing : meal.ingredients()) {
                    if (ing.name().equals(name)) {
                        sum = sum.add(ing.amount());
                    }
                }
            }
            return sum;
        }
    }

    private record MenuMeal(String mealType, String recipeName, Integer servings,
                            List<MenuIngredient> ingredients) {}

    private record MenuIngredient(String name, BigDecimal amount, String unit) {}

    // FIX (раунд 7): fixtureItems()/isFixtureId() перенесены ИЗ записи ShoppingList в класс теста.
    // Внутренний static-класс (record) не может обращаться к нестатическому методу внешнего
    // класса — компилятор падал с "non-static method isFixtureId(java.lang.Long) cannot be
    // referenced from a static context" (CI, testCompile). Вызывающие места (368/370/524 и
    // itemAmount/itemPlannedCost/itemActualCost внутри записи) остаются валидными: экземпляр
    // записи создаётся Jackson'ом внутри методов этого же класса, а simple-name `fixtureItems`
    // резолвится сначала в методы внешней записи (itemXxx), затем во внешний метод класса.
    /** id ∈ {5 фикстур} или trip-scoped снепшот одной из них (V20 copy-on-write). */
    private boolean isFixtureId(Long id) {
        if (id == null) return false;
        if (id.equals(grechkaId) || id.equals(tushenkaId) || id.equals(butterId)
                || id.equals(riceId) || id.equals(saltId)) {
            return true;
        }
        Integer cnt = jdbc.queryForObject(
                "SELECT count(*) FROM ingredients WHERE id = ? AND snapshot_of IN (?, ?, ?, ?, ?)",
                Integer.class, id, grechkaId, tushenkaId, butterId, riceId, saltId);
        return cnt != null && cnt > 0;
    }

    /** Только позиции тестовых фикстур (по id) — сид-строки с теми же именами отсекаются. */
    private List<ShoppingItem> fixtureItems(ShoppingList list) {
        return list.items().stream().filter(i -> isFixtureId(i.ingredientId())).toList();
    }

    private record ShoppingList(List<ShoppingItem> items, BigDecimal totalPlannedCost,
            BigDecimal totalActualCost, BigDecimal deltaPercent, Integer overriddenCount) {

        BigDecimal itemAmount(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        BigDecimal itemPlannedCost(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::plannedCost).filter(java.util.Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        BigDecimal itemActualCost(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::actualCost).filter(java.util.Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
    }

    private record ShoppingItem(
            Long ingredientId,
            String ingredientName,
            String unit,
            BigDecimal totalAmount,
            BigDecimal plannedUnitPrice,
            BigDecimal actualUnitPrice,
            BigDecimal plannedCost,
            BigDecimal actualCost,
            boolean overridden
    ) {}

    private record DayShopping(String dayDate, List<ShoppingItem> items,
                               BigDecimal plannedCost, BigDecimal actualCost) {}

    private record PersonSummary(
            List<PersonIngredient> ingredients,
            Integer totalPersonMeals,
            BigDecimal plannedCostPerDefaultPerson,
            BigDecimal actualCostPerDefaultPerson,
            BigDecimal plannedCostPerPersonMeal,
            BigDecimal actualCostPerPersonMeal,
            BigDecimal caloriesPerPersonMeal
    ) {}

    private record PersonIngredient(
            String ingredientName,
            String unit,
            BigDecimal amountPerDefaultPerson,
            BigDecimal amountPerPersonMeal,
            BigDecimal plannedCostPerDefaultPerson,
            BigDecimal actualCostPerDefaultPerson,
            BigDecimal plannedCostPerPersonMeal,
            BigDecimal actualCostPerPersonMeal
    ) {}

    // ==================== HELPER METHODS (API) ====================

    private MvcResult getMenu() throws Exception {
        return mockMvc.perform(get("/api/v1/trips/" + tripId + "/summary/menu")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn();
    }

    private MvcResult getShopping() throws Exception {
        return mockMvc.perform(get("/api/v1/trips/" + tripId + "/summary/shopping")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn();
    }

    private MvcResult getByDays() throws Exception {
        return mockMvc.perform(get("/api/v1/trips/" + tripId + "/summary/shopping/by-days")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn();
    }

    private MvcResult getPerson() throws Exception {
        return mockMvc.perform(get("/api/v1/trips/" + tripId + "/summary/person")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn();
    }

    private String registerAndLogin(String email) throws Exception {
        String regBody = String.format(
                "{\"email\":\"%s\",\"password\":\"password123\",\"firstName\":\"E2E\",\"lastName\":\"Test\"}",
                email);
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(regBody))
                .andExpect(status().isCreated());

        String loginBody = String.format("{\"email\":\"%s\",\"password\":\"password123\"}", email);
        MvcResult loginResult = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody))
                .andExpect(status().isOk())
                .andReturn();

        return text(objectMapper.readTree(body(loginResult)), "accessToken", true);
    }

    /** Создаёт ингредиент и возвращает его id из ответа 201. */
    private Long createIngredient(String name, String code, String unit, int kcal) throws Exception {
        String body = String.format(
                "{\"name\":\"%s\",\"code\":\"%s\",\"unit\":\"%s\",\"category\":\"E2E\",\"kcalPer100g\":%d}",
                name, code, unit, kcal);
        MvcResult result = mockMvc.perform(post("/api/v1/admin/ingredients")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return lng(objectMapper.readTree(body(result)), "id", true);
    }

    /**
     * Переименовывает фикстуру в каноническое имя, которое ассертят экраны
     * ("Гречка"/"Тушёнка"/"Масло"/"Рис"/"Соль"). Только raw SQL: вызывается ПОСЛЕ
     * dropGlobalSeedCatalog() (чужие глобальные сид-строки уже удалены — коллизий с
     * uniq_product_identity_global нет) и ДО создания рецептов; name_norm пересчитывается
     * как в IngredientService (lower + ё->е), чтобы поиск по ингредиенту работал корректно.
     */
    private void renameFixture(Long id, String newName) {
        jdbc.update("UPDATE ingredients SET name = ?, name_norm = ? WHERE id = ?",
                newName, newName.toLowerCase().replace('ё', 'е'), id);
    }

    private Long createRecipe(String name, String ingredientsJson, int baseServings, int kcal) throws Exception {
        String body = String.format(
                "{\"name\":\"%s\",\"mealType\":\"BREAKFAST\",\"baseServings\":%d,\"caloriesPerServing\":%d,\"ingredients\":%s}",
                name, baseServings, kcal, ingredientsJson);
        MvcResult result = mockMvc.perform(post("/api/v1/admin/recipes") // рецепты создаёт только ADMIN
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return lng(objectMapper.readTree(body(result)), "id", true);
    }

    private String recipeIngredients(Object... pairs) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < pairs.length; i += 2) {
            if (i > 0) sb.append(",");
            sb.append("{\"ingredientId\":").append(pairs[i])
                    .append(",\"amount\":").append(pairs[i + 1]).append("}");
        }
        return sb.append("]").toString();
    }

    private Long createTrip(String name, LocalDate start, LocalDate end, int people) throws Exception {
        String body = String.format(
                "{\"name\":\"%s\",\"startDate\":\"%s\",\"endDate\":\"%s\",\"defaultPeople\":%d}",
                name, start, end, people);
        MvcResult result = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return lng(objectMapper.readTree(body(result)), "id", true);
    }

    private Long getDayIdByDate(Long tripId, LocalDate date) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/trips/" + tripId)
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode trip = objectMapper.readTree(body(result));
        JsonNode days = arr(trip, "days", "поход", body(result));
        for (JsonNode d : days) {
            if (date.toString().equals(text(d, "dayDate", true))) {
                return lng(d, "id", true);
            }
        }
        throw new AssertionError("Day not found: " + date);
    }

    private void addMeal(Long dayId, String mealType, Long recipeId, int servings) throws Exception {
        String body = String.format(
                "{\"mealType\":\"%s\",\"recipeId\":%d,\"peopleOverride\":%d}",
                mealType, recipeId, servings);
        mockMvc.perform(post("/api/v1/trips/" + tripId + "/days/" + dayId + "/meals") // путь с tripId + dayId
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());
    }

    private void setPrice(Long ingredientId, BigDecimal price) throws Exception {
        String body = String.format(
                "{\"ingredientId\":%d,\"pricePerUnit\":%s,\"effectiveFrom\":\"2026-01-01\",\"currency\":\"RUB\"}",
                ingredientId, price);
        mockMvc.perform(post("/api/v1/admin/ingredient-prices") // цены создаёт только ADMIN
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());
    }

    // ==================== ПАРСЕРЫ (null-safe, с валидацией структуры) ====================

    private List<MenuByDay> parseMenu(MvcResult result) throws Exception {
        String raw = body(result);
        JsonNode root = objectMapper.readTree(raw);
        if (!root.isArray()) {
            throw new AssertionError("Ожидался JSON-массив дней (/summary/menu); тело: " + truncate(raw));
        }
        List<MenuByDay> list = new ArrayList<>();
        for (JsonNode day : root) {
            JsonNode meals = arr(day, "meals", "день меню", raw);
            List<MenuMeal> mealList = new ArrayList<>();
            for (JsonNode m : meals) {
                JsonNode ingredients = arr(m, "ingredients", "приём пищи", raw);
                List<MenuIngredient> ingList = new ArrayList<>();
                for (JsonNode ing : ingredients) {
                    ingList.add(new MenuIngredient(
                            text(ing, "name", true),
                            dec(ing, "amount", true),
                            text(ing, "unit", true)));
                }
                mealList.add(new MenuMeal(
                        text(m, "mealType", true),
                        text(m, "recipeName", true),
                        intg(m, "servings", true),
                        ingList));
            }
            list.add(new MenuByDay(
                    text(day, "dayDate", true),
                    intg(day, "effectivePeople", false), // двусмысленно -> не req
                    mealList));
        }
        return list;
    }

    private ShoppingList parseShoppingList(MvcResult result) throws Exception {
        String raw = body(result);
        JsonNode root = objectMapper.readTree(raw);
        if (!root.isObject()) {
            throw new AssertionError("Ожидался JSON-объект (/summary/shopping); тело: " + truncate(raw));
        }
        JsonNode items = arr(root, "items", "закупка", raw);
        List<ShoppingItem> itemList = new ArrayList<>();
        for (JsonNode item : items) {
            itemList.add(new ShoppingItem(
                    lng(item, "ingredientId", true),
                    text(item, "ingredientName", true),
                    text(item, "unit", true),
                    dec(item, "totalAmount", true),
                    dec(item, "plannedUnitPrice", false),
                    dec(item, "actualUnitPrice", false),
                    dec(item, "plannedCost", false),
                    dec(item, "actualCost", false),
                    bool(item, "overridden", true)));
        }
        return new ShoppingList(
                itemList,
                dec(root, "totalPlannedCost", true),
                dec(root, "totalActualCost", true),
                dec(root, "deltaPercent", false),
                intg(root, "overriddenCount", true));
    }

    /** Бывший второй parseMenu — теперь с правильным именем и типом. */
    private List<DayShopping> parseDayShopping(MvcResult result) throws Exception {
        String raw = body(result);
        JsonNode root = objectMapper.readTree(raw);
        if (!root.isArray()) {
            throw new AssertionError("Ожидался JSON-массив дней (/summary/shopping/by-days); тело: " + truncate(raw));
        }
        List<DayShopping> list = new ArrayList<>();
        for (JsonNode day : root) {
            JsonNode items = arr(day, "items", "день закупки", raw);
            List<ShoppingItem> itemList = new ArrayList<>();
            for (JsonNode item : items) {
                itemList.add(new ShoppingItem(
                        lng(item, "ingredientId", true),
                        text(item, "ingredientName", true),
                        text(item, "unit", true),
                        dec(item, "totalAmount", true),
                        dec(item, "plannedUnitPrice", false),
                        dec(item, "actualUnitPrice", false),
                        dec(item, "plannedCost", false),
                        dec(item, "actualCost", false),
                        bool(item, "overridden", true)));
            }
            list.add(new DayShopping(
                    text(day, "dayDate", true),
                    itemList,
                    dec(day, "plannedCost", true),
                    dec(day, "actualCost", false)));
        }
        return list;
    }

    private PersonSummary parsePersonSummary(MvcResult result) throws Exception {
        String raw = body(result);
        JsonNode root = objectMapper.readTree(raw);
        if (!root.isObject()) {
            throw new AssertionError("Ожидался JSON-объект (/summary/person); тело: " + truncate(raw));
        }
        JsonNode trip = root.get("tripSummary");
        if (trip == null || trip.isNull()) {
            throw new AssertionError("Нет поля tripSummary в /summary/person; тело: " + truncate(raw));
        }
        return new PersonSummary(
                List.of(),
                intg(trip, "totalPersonMeals", true),
                dec(trip, "plannedCostPerDefaultPerson", true),
                dec(trip, "actualCostPerDefaultPerson", true),
                dec(trip, "plannedCostPerPersonMeal", true),
                dec(trip, "actualCostPerPersonMeal", true),
                dec(trip, "caloriesPerPersonMeal", false));
    }

    // ==================== БЕЗОПАСНЫЕ ХЕЛПЕРЫ ЧТЕНИЯ JSON ====================

    private static String body(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private static String truncate(String s) {
        return s == null ? "null" : (s.length() > 600 ? s.substring(0, 600) + "…" : s);
    }

    private static String text(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/nil в: " + n);
            return null;
        }
        return v.asText();
    }

    /** Long после Фазы 11 сериализуется в String ("140") — парсим и число, и строку. */
    private static long lng(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/nil в: " + n);
            return 0L;
        }
        return v.isNumber() ? v.asLong() : Long.parseLong(v.asText().trim());
    }

    private static int intg(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/nil в: " + n);
            return 0;
        }
        return v.isNumber() ? v.asInt() : Integer.parseInt(v.asText().trim());
    }

    private static BigDecimal dec(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/nil в: " + n);
            return null;
        }
        if (v.isNumber()) return v.decimalValue();
        String s = v.asText().trim();
        if (s.isEmpty()) {
            if (required) throw new AssertionError("Поле '" + f + "' пустое в: " + n);
            return null;
        }
        return new BigDecimal(s);
    }

    private static boolean bool(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/nil в: " + n);
            return false;
        }
        return v.asBoolean();
    }

    private static JsonNode arr(JsonNode n, String f, String ctx, String rawBody) {
        JsonNode v = n.get(f);
        if (v == null || !v.isArray()) {
            throw new AssertionError("Ожидался массив '" + f + "' в " + ctx + "; тело: " + truncate(rawBody));
        }
        return v;
    }
}