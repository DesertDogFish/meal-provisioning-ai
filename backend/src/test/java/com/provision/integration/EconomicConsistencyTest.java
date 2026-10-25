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

        // FIX (DuplicateKey, раунд 4): попытка завести фикстуры под уникальными именами и
        // затем переименовать их в канонические ("Гречка" и т.д.) упёрлась в partial-индекс
        // uniq_product_identity_global (V20): UNIQUE (name_norm, unit) WHERE trip_id IS NULL,
        // а сид V3__seed_catalog.sql УЖЕ содержит глобальные строки buckwheat/Гречка KG и
        // др. — переименование давало коллизию. Правильная схема: фикстурами выступают сами
        // сидовые ингредиенты — берём их id по кодам сида V3 (buckwheat, beef_stew, butter,
        // rice, salt; кода "tushonka" в сиде нет — там beef_stew/"Тушенка говяжья 325 г") и
        // создаём РЕЦЕПТЫ ТОЛЬКО из них. Никаких POST /admin/ingredients больше не нужно.
        grechkaId = seedIngredientId("buckwheat");
        tushenkaId = seedIngredientId("beef_stew");
        butterId = seedIngredientId("butter");
        riceId = seedIngredientId("rice");
        saltId = seedIngredientId("salt");

        // FIX (DuplicateKey, раунд 4): фикстуры — сидовые ингредиенты; их канонические имена
        // из сида ("Масло сливочное", "Тушенка говяжья 325 г") не совпадают с именами в
        // ассертах экранов. Нормализуем ИМЕНА фикстур к коротким канонам тестов. Коллизий по
        // uniq_product_identity_global (V20: UNIQUE(name_norm,unit) WHERE trip_id IS NULL) нет:
        // в сидах V3/V12/V17/V20 отсутствуют строки с name_norm in {тушёнка, масло, рис} при
        // unit KG (проверено grep'ом), а UPDATE выполняется ДО создания рецептов/похода,
        // поэтому бэкфил V20 (temp-таблицы ing_src/map_ing) эти переименования не касается.
        renameFixture(grechkaId, "Гречка");
        renameFixture(tushenkaId, "Тушёнка");
        renameFixture(butterId, "Масло");
        renameFixture(riceId, "Рис");
        renameFixture(saltId, "Соль");

        // Сид V3 (base-цена на '2026-01-01') + V13 (месячные срезы за 24 мес. до 2026-10-01,
        // т.е. по 2026-09-01 включительно) сеют ИСТОРИЮ ЦЕН на сидовые ингредиенты — а наши
        // фикстуры ТЕПЕРЬ и есть сидовые строки. setPrice() ниже пишет базовые цены теста в
        // effectiveFrom='2026-01-01', поэтому: (а) чистим seed-строки ingredient_prices этих
        // id, иначе existsByIngredientIdAndEffectiveFrom -> ConflictException(409); (б) после
        // записи baseline удаляем ВСЕ более ранние/поздние срезы, кроме '2026-01-01' — экраны
        // резолвят цену как последнюю effective_from <= даты, и без чистки расчёты EK-экранов
        // ловили бы сезонные цены V13 вместо заложенных 100/200/400/50/10.
        jdbc.update("DELETE FROM ingredient_prices WHERE ingredient_id IN (?, ?, ?, ?, ?)",
                grechkaId, tushenkaId, butterId, riceId, saltId);

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

        // (б) из комментария выше: оставляем ровно одну цену на фикстурах — baseline теста.
        jdbc.update("DELETE FROM ingredient_prices WHERE ingredient_id IN (?, ?, ?, ?, ?)"
                        + " AND effective_from <> DATE '2026-01-01'",
                grechkaId, tushenkaId, butterId, riceId, saltId);

        // FIX (V20 copy-on-write): POST /days/{dayId}/meals создаёт trip-scoped СНЕПШОТЫ
        // рецептов и ингредиентов (TripCatalogSnapshotService), замораживая плановую цену по
        // findEffectivePrice(..., LocalDate.now()) НА МОМЕНТ добавления блюда. Поэтому цены
        // должны быть записаны ДО addMeal — иначе снепшоты словят сезонный срез V13 вместо
        // baseline 100/200/400/50/10 и ассерты EK-экранов по стоимости не сойдутся.
        setPrices();
        addMeals();
    }

    private void addMeals() throws Exception {
        // День 1: Р1 x10; День 2: Р2 x4 + Р3 x4; День 3: Р4 x3 + Р5 x3
        addMeal(day1Id, "BREAKFAST", recipe1Id, 10);
        addMeal(day2Id, "BREAKFAST", recipe2Id, 4);
        addMeal(day2Id, "DINNER", recipe3Id, 4);
        addMeal(day3Id, "BREAKFAST", recipe4Id, 3);
        addMeal(day3Id, "DINNER", recipe5Id, 3);
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
        assertThat(day1.effectivePeople()).isEqualTo(10); // одно блюдо — однозначно
        assertThat(day1.meals()).hasSize(1);

        MenuMeal meal1 = day1.meals().get(0);
        assertThat(meal1.recipeName()).isEqualTo("Каша гречневая с тушёнкой");
        assertThat(meal1.servings()).isEqualTo(10);

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

        assertThat(list.items()).hasSize(5); // соль с 0 ккал присутствует
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("806.30");
        assertThat(list.totalActualCost()).isEqualByComparingTo("806.30"); // без оверрайдов

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

        assertThat(days.get(0).dayDate()).isEqualTo("2026-07-01");
        assertThat(days.get(0).plannedCost()).isEqualByComparingTo("301.00");
        assertThat(days.get(1).dayDate()).isEqualTo("2026-07-02");
        assertThat(days.get(1).plannedCost()).isEqualByComparingTo("280.00");
        assertThat(days.get(2).dayDate()).isEqualTo("2026-07-03");
        assertThat(days.get(2).plannedCost()).isEqualByComparingTo("225.30");

        BigDecimal sum = BigDecimal.ZERO;
        for (DayShopping d : days) {
            sum = sum.add(d.plannedCost());
        }
        assertThat(sum).isEqualByComparingTo("806.30");
    }

    // ==================== ЭКРАН 4: НА ЧЕЛОВЕКА ====================

    @Test
    @DisplayName("EK-06: На человека — инварианты согласованности DTO (модель-независимо)")
    void ekran4_personSummary() throws Exception {
        createFixtures();
        PersonSummary p = parsePersonSummary(getPerson());
        ShoppingList s = parseShoppingList(getShopping());
        BigDecimal total = s.totalPlannedCost(); // 806.30
        int tpm = p.totalPersonMeals();

        // Инвариант 1: итог / perPersonMeal == totalPersonMeals (в пределах округления).
        // Ловит рассинхрон "цена делится на один счётчик, приёмов — на другой".
        assertThat(total.divide(p.plannedCostPerPersonMeal(), 0, RoundingMode.HALF_UP))
                .as("plannedCostPerPersonMeal не согласован с totalPersonMeals")
                .isEqualByComparingTo(BigDecimal.valueOf(tpm));

        // Инвариант 2: итог / perDefaultPerson == defaultPeople.
        assertThat(total.divide(p.plannedCostPerDefaultPerson(), 0, RoundingMode.HALF_UP))
                .as("plannedCostPerDefaultPerson не согласован с defaultPeople")
                .isEqualByComparingTo(BigDecimal.valueOf(DEFAULT_PEOPLE));

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

        ShoppingList list = parseShoppingList(getShopping());

        // План не изменился
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("806.30");
        // Факт: 216.00 + 234.00 + 280.00 + 85.00 + 1.30 = 816.30
        assertThat(list.totalActualCost()).isEqualByComparingTo("816.30");
        assertThat(list.itemActualCost("Гречка")).isEqualByComparingTo("216.00");
        assertThat(list.itemActualCost("Тушёнка")).isEqualByComparingTo("234.00");
        assertThat(list.itemActualCost("Масло")).isEqualByComparingTo("280.00"); // без оверрайда
        // Оверрайд меняет ТОЛЬКО цену: веса прежние
        assertThat(list.itemAmount("Гречка")).isEqualByComparingTo("1.800");
        assertThat(list.itemAmount("Тушёнка")).isEqualByComparingTo("1.300");
        assertThat(list.overriddenCount()).isEqualTo(2);
        assertThat(list.totalActualCost().subtract(list.totalPlannedCost()))
                .isEqualByComparingTo("10.00");

        // Кросс-проверка: оверрайд пробрасывается в по-дневную разбивку
        List<DayShopping> byDays = parseDayShopping(getByDays());
        BigDecimal factSum = BigDecimal.ZERO;
        for (DayShopping d : byDays) {
            assertThat(d.actualCost())
                    .as("by-days: нет actualCost — оверрайд не пробросился в день " + d.dayDate())
                    .isNotNull();
            factSum = factSum.add(d.actualCost());
        }
        assertThat(factSum).isEqualByComparingTo("816.30");
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
        BigDecimal totalWeight = BigDecimal.ZERO;
        for (DayShopping d : dayShopping) {
            for (ShoppingItem item : d.items()) {
                totalWeight = totalWeight.add(item.totalAmount());
            }
        }
        assertThat(totalWeight).isEqualByComparingTo("5.630");

        // 2. Сумма плановой цены по дням == итог закупки == 806.30
        BigDecimal daySum = BigDecimal.ZERO;
        for (DayShopping d : dayShopping) {
            daySum = daySum.add(d.plannedCost());
        }
        assertThat(daySum).isEqualByComparingTo(shopping.totalPlannedCost());
        assertThat(daySum).isEqualByComparingTo("806.30");

        // 3. Инвариант "на человека" vs итог закупки (модель-независимо)
        assertThat(shopping.totalPlannedCost()
                .divide(person.plannedCostPerPersonMeal(), 0, RoundingMode.HALF_UP))
                .as("EK-08: perPersonMeal x TPM != итог (рассинхрон агрегации)")
                .isEqualByComparingTo(BigDecimal.valueOf(person.totalPersonMeals()));

        // 4. Каждая строка закупки == сумма этой строки по дням (по каждому ингредиенту)
        for (ShoppingItem shopItem : shopping.items()) {
            BigDecimal sumByDays = BigDecimal.ZERO;
            for (DayShopping d : dayShopping) {
                for (ShoppingItem dayItem : d.items()) {
                    if (dayItem.ingredientId().equals(shopItem.ingredientId())) {
                        sumByDays = sumByDays.add(dayItem.totalAmount());
                    }
                }
            }
            assertThat(sumByDays).isEqualByComparingTo(shopItem.totalAmount())
                    .as("Вес %s (%s) != сумма по дням (%s)",
                            shopItem.ingredientName(), shopItem.totalAmount(), sumByDays);
        }

        // 5. Меню по дням: сумма весов ингредиентов по всем дням == 5.63 кг
        BigDecimal menuWeight = BigDecimal.ZERO;
        for (MenuByDay d : menuDays) {
            for (MenuMeal m : d.meals()) {
                for (MenuIngredient ing : m.ingredients()) {
                    menuWeight = menuWeight.add(ing.amount());
                }
            }
        }
        assertThat(menuWeight).isEqualByComparingTo("5.630");
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ КЛАССЫ ====================

    private record MenuByDay(String dayDate, Integer effectivePeople, List<MenuMeal> meals) {
        BigDecimal ingredientAmount(String name) {
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

    private record ShoppingList(
            List<ShoppingItem> items,
            BigDecimal totalPlannedCost,
            BigDecimal totalActualCost,
            BigDecimal deltaPercent,
            Integer overriddenCount
    ) {
        BigDecimal itemAmount(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .findFirst().orElseThrow().totalAmount();
        }
        BigDecimal itemPlannedCost(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .findFirst().orElseThrow().plannedCost();
        }
        BigDecimal itemActualCost(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .findFirst().orElseThrow().actualCost();
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
     * id сидового ингредиента по коду (строки V3__seed_catalog.sql после TestDataIsolation.reset():
     * buckwheat/'Гречка'/KG, beef_stew/'Тушенка говяжья 325 г'/PCS, butter/'Масло сливочное'/KG,
     * rice/'Рис'/KG, salt/'Соль'/KG). Глобальных дублей по коду нет (uniq-ограничение сида),
     * поэтому queryForObject ожидаемо возвращает ровно 1 строку.
     */
    private Long seedIngredientId(String code) {
        return jdbc.queryForObject("SELECT id FROM ingredients WHERE code = ? AND trip_id IS NULL",
                Long.class, code);
    }

    /**
     * Переименовывает фикстуру в каноническое имя, которое ассертят экраны
     * ("Гречка"/"Тушёнка"/"Масло"/"Рис"/"Соль"). Только raw SQL: вызывается ДО
     * создания рецептов; name_norm пересчитывается как в IngredientService
     * (lower + ё->е), чтобы поиск по ингредиенту работал корректно.
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