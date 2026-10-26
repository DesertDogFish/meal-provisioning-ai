package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.provision.dto.trip.TripPriceOverrideRequest;
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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E-ECON: СКВОЗНОЙ СТРАЖ ЭКОНОМИКИ ПОХОДА.
 *
 * Единственная цель класса — гарантировать, что математика продукта сходится до копейки
 * на всех экранах и что все сущности похода привязаны к его trip-scoped каталогу (V20).
 * Тест намеренно проходит ВЕСЬ продуктовый путь только через публичное API
 * (admin-каталог → поход → приёмы → состав → чеки) и сверяет ответы с числами,
 * посчитанными на бумаге (см. таблицу сценария ниже). Никакого raw-SQL для ПОДГОТОВКИ
 * данных — SQL используется только read-only для проверки связей в БД (блок «Integrity»).
 *
 * ============================ СЦЕНАРИЙ (числа на бумаге) ============================
 * Продукты (глобальный каталог, категория из сида):
 *   ЭК Гречка     KG  343 ккал   цены: 100.00 @2026-01-01, 130.00 @2026-07-02
 *   ЭК Тушёнка    PCS 250 г/шт   215 ккал   200.00 @2026-01-01
 *   ЭК Масло     KG  734 ккал   упаковка 0.2, roundToPacks   400.00 @2026-01-01
 *   ЭК Рис        KG  340 ккал   50.00 @2026-01-01
 *   ЭК Соль       KG  (без ккал) 10.00 @2026-01-01
 *   ЭК Сгущёнка   KG  320 ккал   300.00 @2026-01-01
 * Рецепты:
 *   R1 «ЭК Каша гречневая»  base=2, 500 ккал/порция: Гречка 0.4, Тушёнка 2, Соль 0.02
 *   R2 «ЭК Рис с маслом»    base=4, 400 ккал/порция: Рис 0.8, Масло 0.2
 *   R3 «ЭК Гречка с маслом» base=1, 350 ккал/порция: Гречка 0.25, Масло 0.05
 * Поход 2026-07-01..2026-07-03, defaultPeople=4. Приёмы:
 *   Д1 ЗАВТРАК R1 ×10 чел        → Гр 2.0, Тш 10, Соль 0.1
 *   Д2 ЗАВТРАК R2 (без оверрайда → 4 чел) → Рис 0.8, Масло 0.2
 *   Д2 УЖИН    R3 ×6 чел         → Гр 1.5, Масло 0.3
 *   Д3 ЗАВТРАК R1 ×4 чел         → Гр 0.8, Тш 4, Соль 0.04
 * Состав приёма Д3-R1 (PUT composition, правки per-recipe → действуют и на Д1-R1):
 *   Гречка SCALED ×1.5; Соль EXCLUDED; Сгущёнка EXTRA 0.3 (АБСОЛЮТ на приём, id глобальный);
 *   SUBST Тушёнка→Сгущёнка ratio 0.1 (id цели глобальный — сервер обязан привязать его к походу).
 *
 * Закупка (план; цены заморожены на дату старта похода — 100/200/400/50/10/300):
 *   Д1: Гр 2.0×1.5=3.0; Тш 10→0 (SUBST), Сгущ +10×0.1=1.0; Соль 0.1→0 (EXCLUDED); EXTRA Сгущ +0.3
 *   Д2: Рис 0.8; Масло 0.2+0.3=0.5; Гр 1.5 (R3 без правок)
 *   Д3: Гр 0.8×1.5=1.2; Тш 4→0, Сгущ +4×0.1=0.4; Соль 0.04→0; EXTRA Сгущ +0.3
 *   ИТОГ: Гр 5.7×100=570.00 | Тш 0×200=0.00 | Масло 0.5×400=200.00 (упаковок 3, купить 0.6, излишек 0.1)
 *         Рис 0.8×50=40.00 | Соль 0×10=0.00 | Сгущ (1.0+0.3)+(0.4+0.3)=2.0×300=600.00
 *   План всего: 1410.00 → итог экрана 1410 (roundToRub); по дням 690.00+390.00+330.00 → 690/390/330.
 * На человека: TPM=10+4+6+4=24; perDefault=round(1410/4=352.5)=353; perMeal=round(1410/24=58.75)=59;
 *   ккал=(500×10+400×4+350×6+500×4)=10700 → 10700/24=445.83 → 446.
 * Состав Д3 GET: people=4, base=2; Гр SCALED derived 0.4/2×4×1.5=1.2; Тш effective 0 (source обнулён);
 *   Соль EXCLUDED 0; Сгущ EXTRA effective 0.3+0.4=0.7 (substitutedFrom «ЭК Тушёнка»);
 *   totals: plannedCost 1.2×100+0.7×300=330.00 (== день Д3), вес 1200+700=1900.0 г,
 *   ккал 12×343/1... = 1200/100×343 + 700/100×320 = 4116+2240=6356.0.
 * Чеки (оверрайды): Гречка→120.00 через ГЛОБАЛЬНЫЙ id (сервер редиректит на снепшот),
 *   Сгущёнка→250.00 через SNAPSHOT id:
 *   факт: Гр 5.7×120=684.00, Сг 2.0×250=500.00, Рис 40.00, Масло 200.00, Тш/Соль 0 → 1424.00 → 1424;
 *   дельта (1424−1410)/1410×100 = 0.99%; overriddenCount=2; факт по дням 685/420/319.
 * Изоляция V20: новая глобальная цена Гречки 150.00 @2026-06-15 ПОСЛЕ добавления блюд
 *   не меняет ничего (план заморожен): итог остаётся 1410.
 * updateMeal(Д3, peopleOverride=5, recipeId=ГЛОБАЛЬНЫЙ R1): приём обязан остаться на trip-снепшоте,
 *   правки состава продолжают действовать: Гр 0.4/2×5×1.5=1.5 → Гр всего 6.0 (600.00);
 *   Тш 5→0, Сгущ 0.5+0.3=0.8 → Сг всего 2.1 (630.00); итог 1470; TPM=25.
 * ===================================================================================
 *
 * Инфра: отдельный профиль «econ» — свой кэш-ключ контекста Spring (своя БД
 * provision_test_econ), без @Transactional на классе: TestDataIsolation.reset(jdbc, flyway)
 * пересоздаёт схему из миграций перед каждым тестом (DDL внутри тестовой транзакции вешает
 * Hibernate), фикстуры создаёт createFixtures() в начале каждого @Test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@ActiveProfiles({"test", "econ"})
@DisplayName("E2E-ECON: Economic consistency guardian (all screens, exact numbers)")
class EconomicConsistencyTest {

    /** Docker есть -> Testcontainers; нет -> локальный PG-fallback. */
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

    // ==================== константы сценария ====================
    private static final LocalDate START = LocalDate.of(2026, 7, 1);
    private static final LocalDate END = LocalDate.of(2026, 7, 3);
    private static final int DEFAULT_PEOPLE = 4;
    private static final String PRICE_BASE_DATE = "2026-01-01";

    // глобальные id (созданы через API)
    private Long grechkaId, tushenkaId, masloId, risId, solId, sgushId;
    private Long r1Id, r2Id, r3Id;
    private Long tripId, day1Id, day2Id, day3Id;
    private Long mealD1R1Id, mealD3R1Id;
    /** globalId продукта → id его trip-снепшота (заполняется после addMeals, read-only SQL). */
    private final Map<Long, Long> snap = new HashMap<>();

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired private org.flywaydb.core.Flyway flyway;

    private String admin;

    @BeforeEach
    void setUp() {
        TestDataIsolation.reset(jdbc, flyway);
    }

    // ==================== фикстуры (только публичное API) ====================

    /** Полный продуктовый сценарий: каталог → цены → рецепты → поход → приёмы → состав Д3. */
    private void createFixtures() throws Exception {
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
        Composition comp = getComposition(mealD3R1Id);
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

    private void loadSnapshotIds() {
        snap.clear();
        jdbc.query("SELECT id, snapshot_of FROM ingredients WHERE trip_id = ?", rs -> {
            snap.put(rs.getLong(2), rs.getLong(1));
        }, tripId);
    }

    private Long snapshotOf(Long globalId) {
        Long s = snap.get(globalId);
        assertThat(s).as("trip-снепшот продукта %d обязан существовать (V20)", globalId).isNotNull();
        return s;
    }

    // ==================== ЭКРАН: МЕНЮ ПО ДНЯМ ====================

    @Test
    @DisplayName("EK-01 Меню: количества = рецепт/base×people, правки состава меню НЕ касаются")
    void menuByDays() throws Exception {
        createFixtures();
        List<MenuDay> days = parseMenu(getTrip("/summary/menu"));
        assertThat(days).hasSize(3);

        MenuDay d1 = days.get(0);
        assertThat(d1.dayDate()).isEqualTo("2026-07-01");
        // Контракт продукта: effectivePeople дня = day.peopleOverride ?? trip.defaultPeople
        // (people-оверрайды отдельных блюд в шапке дня не участвуют — они видны в servings блюд).
        assertThat(d1.effectivePeople()).isEqualTo(DEFAULT_PEOPLE);
        assertThat(d1.meals()).hasSize(1);
        MenuMeal m1 = d1.meals().get(0);
        assertThat(m1.recipeName()).isEqualTo("ЭК Каша гречневая");
        assertThat(m1.servings()).isEqualTo(10);
        assertThat(m1.amount("ЭК Гречка")).isEqualByComparingTo("2.000");
        assertThat(m1.amount("ЭК Тушёнка")).isEqualByComparingTo("10.000");
        assertThat(m1.amount("ЭК Соль")).isEqualByComparingTo("0.100");

        MenuDay d2 = days.get(1);
        assertThat(d2.meals()).hasSize(2);
        assertThat(d2.meals().get(0).servings()).as("без оверрайда → defaultPeople").isEqualTo(4);
        assertThat(d2.meals().get(0).amount("ЭК Рис")).isEqualByComparingTo("0.800");
        assertThat(d2.meals().get(0).amount("ЭК Масло")).isEqualByComparingTo("0.200");
        assertThat(d2.meals().get(1).servings()).isEqualTo(6);
        assertThat(d2.meals().get(1).amount("ЭК Гречка")).isEqualByComparingTo("1.500");
        assertThat(d2.meals().get(1).amount("ЭК Масло")).isEqualByComparingTo("0.300");

        MenuDay d3 = days.get(2);
        assertThat(d3.meals().get(0).servings()).isEqualTo(4);
        assertThat(d3.meals().get(0).amount("ЭК Гречка")).isEqualByComparingTo("0.800");
        assertThat(d3.meals().get(0).amount("ЭК Тушёнка")).isEqualByComparingTo("4.000");
        assertThat(d3.meals().get(0).amount("ЭК Соль")).isEqualByComparingTo("0.040");
    }

    // ==================== ЭКРАН: ЗАКУПКА НА ПОХОД ====================

    @Test
    @DisplayName("EK-02 Закупка: SCALED/EXTRA/SUBST/EXCLUDED досчитаны, цены заморожены, итог 1410")
    void shoppingList() throws Exception {
        createFixtures();
        ShoppingList list = parseShopping(getTrip("/summary/shopping"));

        assertThat(list.hasMissingPrices()).as("у всех снепшотов есть замороженная цена").isFalse();
        assertThat(list.items()).as("ровно 6 продуктов сценария, без сид-примесей").hasSize(6);

        assertThat(list.amount("ЭК Гречка")).isEqualByComparingTo("5.700");
        assertThat(list.amount("ЭК Тушёнка")).isEqualByComparingTo("0.000");
        assertThat(list.amount("ЭК Масло")).isEqualByComparingTo("0.500");
        assertThat(list.amount("ЭК Рис")).isEqualByComparingTo("0.800");
        assertThat(list.amount("ЭК Соль")).isEqualByComparingTo("0.000");
        assertThat(list.amount("ЭК Сгущёнка")).as("EXTRA — абсолют на приём: (1.0+0.3)+(0.4+0.3)")
                .isEqualByComparingTo("2.000");

        assertThat(list.planned("ЭК Гречка")).isEqualByComparingTo("570.00");
        assertThat(list.planned("ЭК Тушёнка")).isEqualByComparingTo("0.00");
        assertThat(list.planned("ЭК Масло")).isEqualByComparingTo("200.00");
        assertThat(list.planned("ЭК Рис")).isEqualByComparingTo("40.00");
        assertThat(list.planned("ЭК Соль")).isEqualByComparingTo("0.00");
        assertThat(list.planned("ЭК Сгущёнка")).isEqualByComparingTo("600.00");

        // План заморожен на дате старта: глобальная цена 130.00 @07-02 в план НЕ просачивается.
        assertThat(list.unit("ЭК Гречка", true)).isEqualByComparingTo("100.00");

        // Упаковки: Масло pack 0.2, roundToPacks → ceil(0.5/0.2)=3, купить 0.6, излишек 0.1.
        ShoppingItem maslo = list.byName("ЭК Масло");
        assertThat(maslo.packSize()).isEqualByComparingTo("0.200");
        assertThat(maslo.packsToBuy()).isEqualTo(3);
        assertThat(maslo.buyAmount()).isEqualByComparingTo("0.600");
        assertThat(maslo.leftoverAmount()).isEqualByComparingTo("0.100");

        // Без чеков факт == план.
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("1410");
        assertThat(list.totalActualCost()).isEqualByComparingTo("1410");
        assertThat(list.deltaPercent()).isEqualByComparingTo("0.00");
        assertThat(list.overriddenCount()).isZero();
        assertThat(exactSum(list.items(), true)).isEqualByComparingTo("1410.00");
    }

    // ==================== ЭКРАН: ЗАКУПКА ПО ДНЯМ ====================

    @Test
    @DisplayName("EK-03 По дням: 690 + 390 + 330 = 1410; строка закупки == сумма её дней")
    void shoppingByDays() throws Exception {
        createFixtures();
        List<DayShopping> days = parseDayShopping(getTrip("/summary/shopping/by-days"));
        assertThat(days).hasSize(3);

        assertThat(days.get(0).dayDate()).isEqualTo("2026-07-01");
        assertThat(exactSum(days.get(0).items(), true)).isEqualByComparingTo("690.00");
        assertThat(days.get(0).plannedCost()).isEqualByComparingTo("690");
        assertThat(days.get(0).amount("ЭК Гречка")).isEqualByComparingTo("3.000");
        assertThat(days.get(0).amount("ЭК Сгущёнка")).isEqualByComparingTo("1.300");

        assertThat(exactSum(days.get(1).items(), true)).isEqualByComparingTo("390.00");
        assertThat(days.get(1).plannedCost()).isEqualByComparingTo("390");
        assertThat(days.get(1).amount("ЭК Масло")).as("два приёма одного дня агрегируются").isEqualByComparingTo("0.500");

        assertThat(exactSum(days.get(2).items(), true)).isEqualByComparingTo("330.00");
        assertThat(days.get(2).plannedCost()).isEqualByComparingTo("330");

        // Каждая строка общей закупки == сумма той же строки по дням (до копейки и до грамма).
        ShoppingList total = parseShopping(getTrip("/summary/shopping"));
        for (ShoppingItem item : total.items()) {
            BigDecimal byDaysQty = BigDecimal.ZERO;
            BigDecimal byDaysCost = BigDecimal.ZERO;
            for (DayShopping d : days) {
                for (ShoppingItem di : d.items()) {
                    if (di.ingredientId().equals(item.ingredientId())) {
                        byDaysQty = byDaysQty.add(di.totalAmount());
                        if (di.plannedCost() != null) byDaysCost = byDaysCost.add(di.plannedCost());
                    }
                }
            }
            assertThat(byDaysQty).as("количество %s по дням", item.ingredientName())
                    .isEqualByComparingTo(item.totalAmount());
            assertThat(byDaysCost).as("плановая стоимость %s по дням", item.ingredientName())
                    .isEqualByComparingTo(item.plannedCost() == null ? BigDecimal.ZERO : item.plannedCost());
        }
        BigDecimal roundedDays = days.stream()
                .map(DayShopping::plannedCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(roundedDays).isEqualByComparingTo(total.totalPlannedCost());
    }

    // ==================== ЭКРАН: НА ЧЕЛОВЕКА ====================

    @Test
    @DisplayName("EK-04 На человека: TPM=24, perDefault=353, perMeal=59, ккал/приём=446")
    void personSummary() throws Exception {
        createFixtures();
        PersonSummary p = parsePerson(getTrip("/summary/person"));

        assertThat(p.totalPersonMeals()).as("10+4+6+4").isEqualTo(24);
        assertThat(p.plannedCostPerDefaultPerson()).isEqualByComparingTo("353");
        assertThat(p.actualCostPerDefaultPerson()).isEqualByComparingTo("353");
        assertThat(p.plannedCostPerPersonMeal()).isEqualByComparingTo("59");
        assertThat(p.caloriesPerPersonMeal()).isEqualByComparingTo("446");

        // Позиции «на человека»: Гречка 5.7/4=1.425 и 5.7/24=0.2375→0.238
        PersonIngredient grechka = p.byName("ЭК Гречка");
        assertThat(grechka.amountPerDefaultPerson()).isEqualByComparingTo("1.425");
        assertThat(grechka.amountPerPersonMeal()).isEqualByComparingTo("0.238");
        assertThat(grechka.plannedCostPerDefaultPerson()).isEqualByComparingTo("142.50");

        // Инвариант: пер-человек × люди ≈ точный итог (±0.5 — округление до рублей).
        BigDecimal exactTotal = exactSum(parseShopping(getTrip("/summary/shopping")).items(), true);
        assertThat(p.plannedCostPerDefaultPerson().multiply(BigDecimal.valueOf(DEFAULT_PEOPLE)))
                .isCloseTo(exactTotal, within(new BigDecimal("2.0")));
    }

    // ==================== ЭКРАН: СОСТАВ ПРИЁМА (Модалка B) ====================

    @Test
    @DisplayName("EK-05 Состав Д3: SCALED 1.2, SUBST обнуляет источник, EXTRA-абсолют, totals=день")
    void compositionScreen() throws Exception {
        createFixtures();
        Composition c = getComposition(mealD3R1Id);

        assertThat(c.people()).isEqualTo(4);
        assertThat(c.baseServings()).isEqualTo(2);
        assertThat(c.recipeName()).isEqualTo("ЭК Каша гречневая");

        CompItem grechka = c.byName("ЭК Гречка");
        assertThat(grechka.state()).isEqualTo("SCALED");
        assertThat(grechka.ratio()).isEqualByComparingTo("1.5");
        assertThat(grechka.baseAmountPerServing()).isEqualByComparingTo("0.4");
        assertThat(grechka.derivedAmount()).isEqualByComparingTo("1.200");
        assertThat(grechka.effectiveAmount()).isEqualByComparingTo("1.200");

        // SUBST: строка-источник ОБНУЛЕНА (иначе двойной счёт в totals и в UI).
        CompItem tush = c.byName("ЭК Тушёнка");
        assertThat(tush.effectiveAmount()).isEqualByComparingTo("0");

        CompItem sol = c.byName("ЭК Соль");
        assertThat(sol.state()).isEqualTo("EXCLUDED");
        assertThat(sol.effectiveAmount()).isEqualByComparingTo("0");

        // EXTRA 0.3 (абсолют) + перенос SUBST 4×0.1 = 0.7; цель привязана к походу (snapshot id).
        CompItem sgush = c.byName("ЭК Сгущёнка");
        assertThat(sgush.state()).isEqualTo("EXTRA");
        assertThat(sgush.effectiveAmount()).isEqualByComparingTo("0.700");
        assertThat(sgush.substitutedFrom()).isEqualTo("ЭК Тушёнка");
        assertThat(sgush.ingredientId()).as("EXTRA/SUBST-цель — trip-снепшот, не глобальный id")
                .isEqualTo(snapshotOf(sgushId));

        assertThat(c.substitutions()).hasSize(1);
        Composition.Sub sub = c.substitutions().get(0);
        assertThat(sub.fromName()).isEqualTo("ЭК Тушёнка");
        assertThat(sub.toName()).isEqualTo("ЭК Сгущёнка");
        assertThat(sub.ratio()).isEqualByComparingTo("0.1");

        // totals состава == закупка дня Д3 (330.00); вес и ккал — точные.
        assertThat(c.totalsPlannedCost()).isEqualByComparingTo("330.00");
        assertThat(c.totalsWeightGrams()).isEqualByComparingTo("1900.0");
        assertThat(c.totalsKcal()).isEqualByComparingTo("6356.0");

        // PUT идемпотентен: повтор того же тела не меняет ответ.
        putComposition(mealD3R1Id, List.of(
                itemDto(grechka.ingredientId(), "SCALED", null, "1.5"),
                itemDto(tush.ingredientId(), "RECIPE", null, null),
                itemDto(sol.ingredientId(), "EXCLUDED", null, null),
                itemDto(sgush.ingredientId(), "EXTRA", "0.3", null)
        ), List.of(subDto(tush.ingredientId(), sgush.ingredientId(), "0.1")));
        Composition c2 = getComposition(mealD3R1Id);
        assertThat(c2.byName("ЭК Сгущёнка").effectiveAmount()).isEqualByComparingTo("0.700");
        assertThat(c2.totalsPlannedCost()).isEqualByComparingTo("330.00");
    }

    // ==================== ЭКРАН: ЗАКУПКА И ЧЕКИ (ОВЕРРАЙДЫ) ====================

    @Test
    @DisplayName("EK-06 Чеки: Гр→120 (глоб id редиректится), Сг→250 (снепшот id): факт 1424, дельта 0.99")
    void priceOverrides() throws Exception {
        createFixtures();

        // Чек на продукт из справочника: UI/API может отправить ГЛОБАЛЬНЫЙ id —
        // сервер обязан применить его к trip-снепшоту (иначе ввод чека молча ничего не меняет).
        setOverride(grechkaId, "120.00");
        // И прямой snapshot-id путь (так шлёт вкладка «Закупка и чеки»).
        setOverride(snapshotOf(sgushId), "250.00");

        ShoppingList list = parseShopping(getTrip("/summary/shopping"));
        assertThat(list.overriddenCount()).isEqualTo(2);
        assertThat(list.unit("ЭК Гречка", false)).isEqualByComparingTo("120.00");
        assertThat(list.actual("ЭК Гречка")).isEqualByComparingTo("684.00");
        assertThat(list.actual("ЭК Сгущёнка")).isEqualByComparingTo("500.00");
        assertThat(list.actual("ЭК Рис")).isEqualByComparingTo("40.00");
        assertThat(list.actual("ЭК Масло")).isEqualByComparingTo("200.00");
        // Чек меняет только цену — количества прежние.
        assertThat(list.amount("ЭК Гречка")).isEqualByComparingTo("5.700");
        assertThat(list.amount("ЭК Сгущёнка")).isEqualByComparingTo("2.000");

        assertThat(exactSum(list.items(), false)).isEqualByComparingTo("1424.00");
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("1410");
        assertThat(list.totalActualCost()).isEqualByComparingTo("1424");
        assertThat(list.deltaPercent()).isEqualByComparingTo("0.99");

        // Факт проброшен в по-дневную разбивку: 685 + 420 + 319 = 1424.
        List<DayShopping> days = parseDayShopping(getTrip("/summary/shopping/by-days"));
        assertThat(exactSum(days.get(0).items(), false)).isEqualByComparingTo("685.00");
        assertThat(exactSum(days.get(1).items(), false)).isEqualByComparingTo("420.00");
        assertThat(exactSum(days.get(2).items(), false)).isEqualByComparingTo("319.00");
        assertThat(days.get(0).actualCost()).isEqualByComparingTo("685");

        // «На человека» по факту: round(1424/4)=356; round(1424/24=59.33)=59.
        PersonSummary p = parsePerson(getTrip("/summary/person"));
        assertThat(p.actualCostPerDefaultPerson()).isEqualByComparingTo("356");
        assertThat(p.actualCostPerPersonMeal()).isEqualByComparingTo("59");
    }

    // ==================== ИЗОЛЯЦИЯ V20 (ЗАМОРОЗКА ПЛАНА) ====================

    @Test
    @DisplayName("EK-07 Изоляция: глобальные цены/рецепты ПОСЛЕ планирования поход не меняют")
    void isolationFrozenPlan() throws Exception {
        createFixtures();
        BigDecimal before = parseShopping(getTrip("/summary/shopping")).totalPlannedCost();
        assertThat(before).isEqualByComparingTo("1410");

        // Админ меняет глобальную цену (дата внутри окна похода) и создаёт новую глобальную
        // цену задним числом — замороженный план похода обязан остаться прежним.
        setPrice(grechkaId, "999.00", "2026-07-03");
        setPrice(grechkaId, "150.00", "2026-06-15");
        setPrice(sgushId, "700.00", "2026-06-01");

        ShoppingList after = parseShopping(getTrip("/summary/shopping"));
        assertThat(after.totalPlannedCost()).isEqualByComparingTo("1410");
        assertThat(after.unit("ЭК Гречка", true)).isEqualByComparingTo("100.00");
        assertThat(after.unit("ЭК Сгущёнка", true)).isEqualByComparingTo("300.00");

        // Цены похода (GET /trips/{id}/prices) — только замороженные снепшот-строки ≤ startDate.
        MvcResult pricesRes = mockMvc.perform(get("/api/v1/trips/" + tripId + "/prices")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode prices = objectMapper.readTree(body(pricesRes));
        assertThat(prices.isArray()).isTrue();
        boolean grechkaSeen = false;
        for (JsonNode p : prices) {
            assertThat(text(p, "effectiveFrom", true).substring(0, 10))
                    .as("заброшенная в поход цена действует не позже старта похода")
                    .isLessThanOrEqualTo(START.toString());
            if (lng(p, "ingredientId", true) == snapshotOf(grechkaId)) {
                grechkaSeen = true;
                assertThat(dec(p, "pricePerUnit", true)).isEqualByComparingTo("100.00");
            }
        }
        assertThat(grechkaSeen).as("снепшот Гречки имеет замороженную цену").isTrue();
    }

    // ==================== РЕДАКТИРОВАНИЕ ПРИЁМА (updateMeal) ====================

    @Test
    @DisplayName("EK-08 updateMeal: приём остаётся на trip-снепшоте, правки состава живут, числа пересчитаны")
    void updateMealKeepsSnapshot() throws Exception {
        createFixtures();

        // UI-редактирование приёма шлёт recipeId из пикера (ГЛОБАЛЬНЫЙ id) и новый peopleOverride.
        MvcResult res = mockMvc.perform(put("/api/v1/trips/" + tripId + "/days/" + day3Id + "/meals/" + mealD3R1Id)
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mealType\":\"BREAKFAST\",\"recipeId\":" + r1Id + ",\"peopleOverride\":5}"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(lng(objectMapper.readTree(body(res)), "recipeId", true))
                .as("приём указывает на trip-снепшот рецепта, а не на глобальный каталог")
                .isEqualTo(recipeSnapshotId(r1Id));

        Integer bad = jdbc.queryForObject(
                "SELECT count(*) FROM trip_meals tm JOIN recipes r ON r.id = tm.recipe_id "
                        + "WHERE tm.id = ? AND (r.trip_id IS NULL OR r.snapshot_of IS NULL)",
                Integer.class, mealD3R1Id);
        assertThat(bad).as("после updateMeal блюдо не отвязалось от снепшота").isZero();

        // Люди 5: Гр 0.4/2×5×1.5=1.5; Тш 2/2×5=5 → SUBST 0.5; Сг = EXTRA 0.3 + 0.5 = 0.8.
        Composition c = getComposition(mealD3R1Id);
        assertThat(c.people()).isEqualTo(5);
        assertThat(c.byName("ЭК Гречка").effectiveAmount()).isEqualByComparingTo("1.500");
        assertThat(c.byName("ЭК Сгущёнка").effectiveAmount()).isEqualByComparingTo("0.800");
        assertThat(c.totalsPlannedCost()).isEqualByComparingTo("390.00"); // 1.5×100 + 0.8×300

        ShoppingList list = parseShopping(getTrip("/summary/shopping"));
        assertThat(list.amount("ЭК Гречка")).isEqualByComparingTo("6.000");  // 3.0+1.5+1.5
        assertThat(list.amount("ЭК Сгущёнка")).isEqualByComparingTo("2.100"); // 1.3+0.8
        assertThat(list.totalPlannedCost()).isEqualByComparingTo("1470");     // 600+630+40+200
        assertThat(parsePerson(getTrip("/summary/person")).totalPersonMeals()).isEqualTo(25);
    }

    // ==================== СВЯЗИ В БАЗЕ (INTEGRITY) ====================

    @Test
    @DisplayName("EK-09 Integrity: все сущности похода привязаны к его trip-scoped каталогу")
    void databaseIntegrity() throws Exception {
        createFixtures();
        setOverride(grechkaId, "120.00"); // чек через глобальный id → обязан лечь на снепшот

        // 1. Каждое блюдо похода ссылается на trip-снепшот рецепта со snapshot_of.
        assertZero(
                "приёмы пищи вне trip-снепшотов рецепта",
                "SELECT count(*) FROM trip_meals tm "
                        + "JOIN trip_days td ON td.id = tm.trip_day_id "
                        + "JOIN recipes r ON r.id = tm.recipe_id "
                        + "WHERE td.trip_id = ? AND (r.trip_id IS DISTINCT FROM ? OR r.snapshot_of IS NULL)",
                tripId, tripId);

        // 2. Составы trip-рецептов ссылаются только на trip-продукты того же похода.
        assertZero(
                "строки составов вне trip-снепшотов продуктов",
                "SELECT count(*) FROM recipe_ingredients ri "
                        + "JOIN recipes r ON r.id = ri.recipe_id "
                        + "JOIN ingredients i ON i.id = ri.ingredient_id "
                        + "WHERE r.trip_id = ? AND i.trip_id IS DISTINCT FROM ?",
                tripId, tripId);

        // 3. Правки состава (SCALE/SUBST/EXTRA/EXCLUDE) — только trip-scoped сущности.
        assertZero(
                "правки состава, не привязанные к trip-каталогу похода",
                "SELECT count(*) FROM trip_ingredient_substitutions s "
                        + "WHERE s.trip_id = ? AND ("
                        + " (s.recipe_id IS NOT NULL AND (SELECT trip_id FROM recipes WHERE id = s.recipe_id) IS DISTINCT FROM ?)"
                        + " OR (s.from_ingredient_id IS NOT NULL AND (SELECT trip_id FROM ingredients WHERE id = s.from_ingredient_id) IS DISTINCT FROM ?)"
                        + " OR (s.to_ingredient_id IS NOT NULL AND (SELECT trip_id FROM ingredients WHERE id = s.to_ingredient_id) IS DISTINCT FROM ?))",
                tripId, tripId, tripId, tripId);

        // 4. Чеки (оверрайды) — на trip-продуктах похода (включая ввод через глобальный id).
        assertZero(
                "оверрайды, не привязанные к trip-каталогу похода",
                "SELECT count(*) FROM trip_price_overrides o "
                        + "WHERE o.trip_id = ? AND (SELECT trip_id FROM ingredients WHERE id = o.ingredient_id) IS DISTINCT FROM ?",
                tripId, tripId);

        // 5. Никакого «undefined»/пустоты в trip-каталоге: имя и категория обязательны.
        assertZero(
                "trip-продукты без имени/категории",
                "SELECT count(*) FROM ingredients WHERE trip_id = ? "
                        + "AND (name IS NULL OR btrim(name) = '' OR lower(name) IN ('undefined','null','unknown') "
                        + "     OR category_id IS NULL OR unit IS NULL)",
                tripId);
        assertZero(
                "trip-рецепты без имени/типа",
                "SELECT count(*) FROM recipes WHERE trip_id = ? "
                        + "AND (name IS NULL OR btrim(name) = '' OR lower(name) IN ('undefined','null') "
                        + "     OR meal_type IS NULL OR base_servings IS NULL OR base_servings <= 0)",
                tripId);

        // 6. У каждого trip-продукта, участвующего в меню, есть цена, видимая в окне похода
        //    (effective_from ≤ startDate) — иначе plannedCost=null и «чушь» в итогах.
        assertZero(
                "trip-продукты без цены, видимой на даты похода",
                "SELECT count(DISTINCT i.id) FROM ingredients i "
                        + "JOIN recipe_ingredients ri ON ri.ingredient_id = i.id "
                        + "JOIN recipes r ON r.id = ri.recipe_id "
                        + "WHERE i.trip_id = ? AND NOT EXISTS ("
                        + "  SELECT 1 FROM ingredient_prices p WHERE p.ingredient_id = i.id AND p.effective_from <= ?)",
                tripId, java.sql.Date.valueOf(START));

        // 7. Снепшот-связка полная: у каждой trip-копии есть snapshot_of и оригинал.
        assertZero(
                "trip-копии без snapshot_of",
                "SELECT count(*) FROM ingredients WHERE trip_id = ? AND snapshot_of IS NULL",
                tripId);
    }

    // ==================== КОНСИСТЕНТНОСТЬ ВСЕХ ЭКРАНОВ ====================

    @Test
    @DisplayName("EK-10 Консистентность: меню/закупка/дни/человек/состав сходятся между собой")
    void allScreensConsistent() throws Exception {
        createFixtures();
        List<MenuDay> menu = parseMenu(getTrip("/summary/menu"));
        ShoppingList shopping = parseShopping(getTrip("/summary/shopping"));
        List<DayShopping> byDays = parseDayShopping(getTrip("/summary/shopping/by-days"));
        PersonSummary person = parsePerson(getTrip("/summary/person"));

        // 1. Вес меню БЕЗ правок состава: 2.0+10+0.1 | 0.8+0.2+1.5+0.3 | 0.8+4+0.04 — это
        //    базовый рецепт; закупка отличается на правки — сверяем её саму с собой и с днями.
        BigDecimal menuWeight = BigDecimal.ZERO;
        for (MenuDay d : menu) {
            for (MenuMeal m : d.meals()) {
                for (MenuIngredient ing : m.ingredients()) {
                    menuWeight = menuWeight.add(ing.amount());
                }
            }
        }
        assertThat(menuWeight).isEqualByComparingTo("19.740");

        // 2. Σ точных планов по дням == Σ точных планов закупки == точный итог.
        BigDecimal daysSum = BigDecimal.ZERO;
        for (DayShopping d : byDays) {
            daysSum = daysSum.add(exactSum(d.items(), true));
        }
        BigDecimal shoppingSum = exactSum(shopping.items(), true);
        assertThat(daysSum).isEqualByComparingTo("1410.00");
        assertThat(shoppingSum).isEqualByComparingTo(daysSum);
        assertThat(shopping.totalPlannedCost()).isEqualByComparingTo(roundToRub(shoppingSum));

        // 3. Итоги экрана == round(Σ позиций) — округление не теряет и не придумывает деньги.
        BigDecimal daysRounded = byDays.stream()
                .map(DayShopping::plannedCost).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(daysRounded).isEqualByComparingTo(shopping.totalPlannedCost());

        // 4. «На человека» согласован с итогом и TPM (модель людей — Σ peopleOverride блюд).
        assertThat(person.totalPersonMeals()).isEqualTo(24);
        assertThat(person.plannedCostPerPersonMeal())
                .isEqualByComparingTo(roundToRub(shoppingSum.divide(BigDecimal.valueOf(24), 2, RoundingMode.HALF_UP)));
        assertThat(person.plannedCostPerDefaultPerson())
                .isEqualByComparingTo(roundToRub(shoppingSum.divide(BigDecimal.valueOf(DEFAULT_PEOPLE), 2, RoundingMode.HALF_UP)));

        // 5. Состав каждого приёма в сумме даёт его вклад в день (план), а дни — закупку.
        //    Д3 один приём: totals состава == plannedCost дня.
        Composition d3 = getComposition(mealD3R1Id);
        DayShopping day3 = byDays.get(2);
        assertThat(d3.totalsPlannedCost()).isEqualByComparingTo(exactSum(day3.items(), true));

        // 6. Позиции «на человека» × defaultPeople == количества закупки (±округление).
        for (PersonIngredient pi : person.ingredients()) {
            ShoppingItem si = shopping.byName(pi.ingredientName());
            assertThat(pi.amountPerDefaultPerson().multiply(BigDecimal.valueOf(DEFAULT_PEOPLE)))
                    .as("%s: amountPerDefaultPerson × 4 == totalAmount", pi.ingredientName())
                    .isEqualByComparingTo(si.totalAmount().setScale(3, RoundingMode.HALF_UP));
        }
    }

    // ==================== HTTP-хелперы ====================

    private MvcResult getTrip(String path) throws Exception {
        return mockMvc.perform(get("/api/v1/trips/" + tripId + path)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
    }

    private Long firstCategoryId() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/product-categories")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode root = objectMapper.readTree(body(r));
        assertThat(root.isArray() && !root.isEmpty()).as("сид категорий product_categories").isTrue();
        return lng(root.get(0), "id", true);
    }

    private Long createProduct(String name, String unit, Long categoryId, Integer kcal,
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
        return lng(objectMapper.readTree(body(r)), "id", true);
    }

    private void setPrice(Long ingredientId, String price, String effectiveFrom) throws Exception {
        String body = String.format(
                "{\"ingredientId\":%d,\"pricePerUnit\":%s,\"effectiveFrom\":\"%s\",\"currency\":\"RUB\"}",
                ingredientId, price, effectiveFrom);
        mockMvc.perform(post("/api/v1/admin/ingredient-prices")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());
    }

    private Long createRecipe(String name, int baseServings, int kcal, Map<Long, String> ingredients) throws Exception {
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
        return lng(objectMapper.readTree(body(r)), "id", true);
    }

    private Long createTrip(String name, LocalDate start, LocalDate end, int people) throws Exception {
        String body = String.format(
                "{\"name\":\"%s\",\"startDate\":\"%s\",\"endDate\":\"%s\",\"defaultPeople\":%d}",
                name, start, end, people);
        MvcResult r = mockMvc.perform(post("/api/v1/trips")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn();
        return lng(objectMapper.readTree(body(r)), "id", true);
    }

    private Long dayIdByDate(LocalDate date) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/trips/" + tripId)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
        for (JsonNode d : arr(objectMapper.readTree(body(r)), "days", "поход", body(r))) {
            if (date.toString().equals(text(d, "dayDate", true))) {
                return lng(d, "id", true);
            }
        }
        throw new AssertionError("День не найден: " + date);
    }

    private Long addMeal(Long dayId, String mealType, Long recipeId, Integer peopleOverride) throws Exception {
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
        return lng(objectMapper.readTree(body(r)), "id", true);
    }

    private Long recipeSnapshotId(Long globalRecipeId) {
        Long id = jdbc.queryForObject(
                "SELECT id FROM recipes WHERE trip_id = ? AND snapshot_of = ?", Long.class, tripId, globalRecipeId);
        assertThat(id).as("trip-снепшот рецепта %d", globalRecipeId).isNotNull();
        return id;
    }

    private Composition getComposition(Long mealId) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/v1/trips/" + tripId + "/meals/" + mealId + "/composition")
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn();
        return parseComposition(objectMapper.readTree(body(r)));
    }

    private void putComposition(Long mealId, List<Map<String, Object>> items,
                                List<Map<String, Object>> substitutions) throws Exception {
        Map<String, Object> req = Map.of("items", items, "substitutions", substitutions);
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/meals/" + mealId + "/composition")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk());
    }

    private Map<String, Object> itemDto(Long ingredientId, String state, String amount, String ratio) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ingredientId", ingredientId);
        m.put("state", state);
        if (amount != null) m.put("amount", new BigDecimal(amount));
        if (ratio != null) m.put("ratio", new BigDecimal(ratio));
        return m;
    }

    private Map<String, Object> subDto(Long fromId, Long toId, String ratio) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fromIngredientId", fromId);
        m.put("toIngredientId", toId);
        m.put("ratio", new BigDecimal(ratio));
        return m;
    }

    private void setOverride(Long ingredientId, String actualPrice) throws Exception {
        mockMvc.perform(put("/api/v1/trips/" + tripId + "/price-overrides/" + ingredientId)
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new TripPriceOverrideRequest(new BigDecimal(actualPrice), "чек E2E-ECON"))))
                .andExpect(status().isOk());
    }

    private void assertZero(String message, String sql, Object... args) {
        Integer cnt = jdbc.queryForObject(sql, Integer.class, args);
        assertThat(cnt == null ? -1 : cnt).as(message).isZero();
    }

    // ==================== парсеры ответов ====================

    private List<MenuDay> parseMenu(MvcResult r) throws Exception {
        String raw = body(r);
        JsonNode root = objectMapper.readTree(raw);
        assertThat(root.isArray()).as("/summary/menu — массив дней; тело: %s", truncate(raw)).isTrue();
        List<MenuDay> out = new ArrayList<>();
        for (JsonNode day : root) {
            List<MenuMeal> meals = new ArrayList<>();
            for (JsonNode m : arr(day, "meals", "день меню", raw)) {
                List<MenuIngredient> ings = new ArrayList<>();
                for (JsonNode ing : arr(m, "ingredients", "приём", raw)) {
                    ings.add(new MenuIngredient(text(ing, "name", true), dec(ing, "amount", true),
                            text(ing, "unit", true)));
                }
                meals.add(new MenuMeal(text(m, "mealType", true), text(m, "recipeName", true),
                        intg(m, "servings", true), ings));
            }
            out.add(new MenuDay(text(day, "dayDate", true), intg(day, "effectivePeople", true), meals));
        }
        return out;
    }

    private ShoppingList parseShopping(MvcResult r) throws Exception {
        String raw = body(r);
        JsonNode root = objectMapper.readTree(raw);
        assertThat(root.isObject()).as("/summary/shopping — объект; тело: %s", truncate(raw)).isTrue();
        List<ShoppingItem> items = new ArrayList<>();
        for (JsonNode it : arr(root, "items", "закупка", raw)) {
            items.add(new ShoppingItem(
                    lng(it, "ingredientId", true),
                    text(it, "ingredientName", true),
                    text(it, "unit", true),
                    dec(it, "totalAmount", true),
                    dec(it, "plannedUnitPrice", false),
                    dec(it, "actualUnitPrice", false),
                    dec(it, "plannedCost", false),
                    dec(it, "actualCost", false),
                    bool(it, "overridden", true),
                    dec(it, "packSize", false),
                    intgOrNull(it, "packsToBuy"),
                    dec(it, "buyAmount", false),
                    dec(it, "leftoverAmount", false)));
        }
        return new ShoppingList(items,
                dec(root, "totalPlannedCost", true),
                dec(root, "totalActualCost", true),
                dec(root, "deltaPercent", false),
                intg(root, "overriddenCount", true),
                bool(root, "hasMissingPrices", true));
    }

    private List<DayShopping> parseDayShopping(MvcResult r) throws Exception {
        String raw = body(r);
        JsonNode root = objectMapper.readTree(raw);
        assertThat(root.isArray()).as("/summary/shopping/by-days — массив; тело: %s", truncate(raw)).isTrue();
        List<DayShopping> out = new ArrayList<>();
        for (JsonNode day : root) {
            List<ShoppingItem> items = new ArrayList<>();
            for (JsonNode it : arr(day, "items", "день закупки", raw)) {
                items.add(new ShoppingItem(
                        lng(it, "ingredientId", true),
                        text(it, "ingredientName", true),
                        text(it, "unit", true),
                        dec(it, "totalAmount", true),
                        dec(it, "plannedUnitPrice", false),
                        dec(it, "actualUnitPrice", false),
                        dec(it, "plannedCost", false),
                        dec(it, "actualCost", false),
                        bool(it, "overridden", true),
                        dec(it, "packSize", false),
                        intgOrNull(it, "packsToBuy"),
                        dec(it, "buyAmount", false),
                        dec(it, "leftoverAmount", false)));
            }
            out.add(new DayShopping(text(day, "dayDate", true), items,
                    dec(day, "plannedCost", true), dec(day, "actualCost", false)));
        }
        return out;
    }

    private PersonSummary parsePerson(MvcResult r) throws Exception {
        String raw = body(r);
        JsonNode root = objectMapper.readTree(raw);
        JsonNode trip = root.get("tripSummary");
        assertThat(trip != null && !trip.isNull()).as("/summary/person.tripSummary; тело: %s", truncate(raw)).isTrue();
        List<PersonIngredient> ingredients = new ArrayList<>();
        for (JsonNode pi : arr(root, "ingredients", "person", raw)) {
            ingredients.add(new PersonIngredient(
                    text(pi, "ingredientName", true),
                    text(pi, "unit", true),
                    dec(pi, "amountPerDefaultPerson", true),
                    dec(pi, "amountPerPersonMeal", true),
                    dec(pi, "plannedCostPerDefaultPerson", false),
                    dec(pi, "actualCostPerDefaultPerson", false),
                    dec(pi, "plannedCostPerPersonMeal", false),
                    dec(pi, "actualCostPerPersonMeal", false)));
        }
        return new PersonSummary(ingredients,
                intg(trip, "totalPersonMeals", true),
                dec(trip, "plannedCostPerDefaultPerson", true),
                dec(trip, "actualCostPerDefaultPerson", true),
                dec(trip, "plannedCostPerPersonMeal", true),
                dec(trip, "actualCostPerPersonMeal", true),
                dec(trip, "caloriesPerPersonMeal", false));
    }

    private Composition parseComposition(JsonNode root) {
        List<CompItem> items = new ArrayList<>();
        for (JsonNode it : root.get("items")) {
            items.add(new CompItem(
                    lng(it, "ingredientId", true),
                    text(it, "name", true),
                    text(it, "unit", true),
                    dec(it, "baseAmountPerServing", false),
                    dec(it, "derivedAmount", false),
                    dec(it, "effectiveAmount", true),
                    text(it, "state", true),
                    dec(it, "ratio", false),
                    text(it, "substitutedFrom", false)));
        }
        List<Composition.Sub> subs = new ArrayList<>();
        if (root.has("substitutions") && root.get("substitutions").isArray()) {
            for (JsonNode s : root.get("substitutions")) {
                subs.add(new Composition.Sub(
                        lng(s, "fromIngredientId", true), text(s, "fromName", true),
                        lng(s, "toIngredientId", true), text(s, "toName", true),
                        dec(s, "ratio", false)));
            }
        }
        JsonNode totals = root.get("totals");
        return new Composition(items, subs,
                intg(root, "people", true), intg(root, "baseServings", true),
                text(root, "recipeName", true),
                dec(totals, "kcal", false), dec(totals, "weightGrams", false),
                dec(totals, "plannedCost", false));
    }

    // ==================== модели ответов ====================

    private record MenuDay(String dayDate, Integer effectivePeople, List<MenuMeal> meals) {}

    private record MenuMeal(String mealType, String recipeName, Integer servings, List<MenuIngredient> ingredients) {
        BigDecimal amount(String name) {
            BigDecimal sum = BigDecimal.ZERO;
            for (MenuIngredient ing : ingredients) {
                if (ing.name().equals(name)) sum = sum.add(ing.amount());
            }
            return sum;
        }
    }

    private record MenuIngredient(String name, BigDecimal amount, String unit) {}

    private record ShoppingItem(Long ingredientId, String ingredientName, String unit,
                                BigDecimal totalAmount, BigDecimal plannedUnitPrice, BigDecimal actualUnitPrice,
                                BigDecimal plannedCost, BigDecimal actualCost, boolean overridden,
                                BigDecimal packSize, Integer packsToBuy, BigDecimal buyAmount,
                                BigDecimal leftoverAmount) {}

    private record ShoppingList(List<ShoppingItem> items, BigDecimal totalPlannedCost, BigDecimal totalActualCost,
                                BigDecimal deltaPercent, Integer overriddenCount, boolean hasMissingPrices) {
        ShoppingItem byName(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name)).findFirst()
                    .orElseThrow(() -> new AssertionError("Позиция '" + name + "' не найдена в закупке: "
                            + items.stream().map(ShoppingItem::ingredientName).toList()));
        }
        BigDecimal amount(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        BigDecimal planned(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::plannedCost).filter(java.util.Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        BigDecimal actual(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::actualCost).filter(java.util.Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        BigDecimal unit(String name, boolean planned) {
            ShoppingItem i = byName(name);
            BigDecimal v = planned ? i.plannedUnitPrice() : i.actualUnitPrice();
            assertThat(v).as("%s: %s unit price присутствует", name, planned ? "плановая" : "фактическая").isNotNull();
            return v;
        }
    }

    private record DayShopping(String dayDate, List<ShoppingItem> items,
                               BigDecimal plannedCost, BigDecimal actualCost) {
        BigDecimal amount(String name) {
            return items.stream().filter(i -> i.ingredientName().equals(name))
                    .map(ShoppingItem::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        }
    }

    private record PersonIngredient(String ingredientName, String unit,
                                    BigDecimal amountPerDefaultPerson, BigDecimal amountPerPersonMeal,
                                    BigDecimal plannedCostPerDefaultPerson, BigDecimal actualCostPerDefaultPerson,
                                    BigDecimal plannedCostPerPersonMeal, BigDecimal actualCostPerPersonMeal) {}

    private record PersonSummary(List<PersonIngredient> ingredients, Integer totalPersonMeals,
                                 BigDecimal plannedCostPerDefaultPerson, BigDecimal actualCostPerDefaultPerson,
                                 BigDecimal plannedCostPerPersonMeal, BigDecimal actualCostPerPersonMeal,
                                 BigDecimal caloriesPerPersonMeal) {
        PersonIngredient byName(String name) {
            return ingredients.stream().filter(i -> i.ingredientName().equals(name)).findFirst()
                    .orElseThrow(() -> new AssertionError("Позиция '" + name + "' не найдена в person.ingredients"));
        }
    }

    private record CompItem(Long ingredientId, String name, String unit,
                            BigDecimal baseAmountPerServing, BigDecimal derivedAmount, BigDecimal effectiveAmount,
                            String state, BigDecimal ratio, String substitutedFrom) {}

    private record Composition(List<CompItem> items, List<Sub> substitutions,
                               int people, int baseServings, String recipeName,
                               BigDecimal totalsKcal, BigDecimal totalsWeightGrams, BigDecimal totalsPlannedCost) {
        record Sub(Long fromIngredientId, String fromName, Long toIngredientId, String toName, BigDecimal ratio) {}

        CompItem byName(String name) {
            return items.stream().filter(i -> i.name().equals(name)).findFirst()
                    .orElseThrow(() -> new AssertionError("Строка '" + name + "' не найдена в составе: "
                            + items.stream().map(CompItem::name).toList()));
        }
        Long itemId(String name) {
            return items.stream().filter(i -> i.name().equals(name)).map(CompItem::ingredientId)
                    .findFirst().orElse(null);
        }
    }

    // ==================== утилиты ====================

    /** Локальная копия политики округления итогов (SummaryService.roundToRub, Фаза 14). */
    private static BigDecimal roundToRub(BigDecimal value) {
        return value == null ? null : value.setScale(0, RoundingMode.HALF_UP);
    }

    private static BigDecimal exactSum(List<ShoppingItem> items, boolean planned) {
        BigDecimal s = BigDecimal.ZERO;
        for (ShoppingItem i : items) {
            BigDecimal c = planned ? i.plannedCost() : i.actualCost();
            if (c != null) s = s.add(c);
        }
        return s;
    }

    private static String body(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private static String truncate(String s) {
        return s == null ? "null" : (s.length() > 600 ? s.substring(0, 600) + "…" : s);
    }

    private static String text(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return null;
        }
        return v.asText();
    }

    /** Long сериализуется в String (Фаза 11) — парсим и число, и строку. */
    private static long lng(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return 0L;
        }
        return v.isNumber() ? v.asLong() : Long.parseLong(v.asText().trim());
    }

    private static int intg(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return 0;
        }
        return v.isNumber() ? v.asInt() : Integer.parseInt(v.asText().trim());
    }

    private static Integer intgOrNull(JsonNode n, String f) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) return null;
        return v.isNumber() ? v.asInt() : Integer.parseInt(v.asText().trim());
    }

    private static BigDecimal dec(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
            return null;
        }
        if (v.isNumber()) return v.decimalValue();
        String s = v.asText().trim();
        if (s.isEmpty()) {
            if (required) throw new AssertionError("Поле '" + f + "' пустое в: " + truncate(n.toString()));
            return null;
        }
        return new BigDecimal(s);
    }

    private static boolean bool(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new AssertionError("Поле '" + f + "' отсутствует/null в: " + truncate(n.toString()));
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
