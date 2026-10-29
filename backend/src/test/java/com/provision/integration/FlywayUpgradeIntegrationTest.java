package com.provision.integration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AU-02 (внешний аудит 30.10.2026): апгрейд СУЩЕСТВУЮЩЕЙ БД, а не прогон по пустой.
 *
 * <p>Миграции V14/V15 (сид демо-юзеров) удалены из дерева в {@code af5f2248}. БД владельца
 * и любой деплой старше этой даты держат их в {@code flyway_schema_history}, а Flyway
 * валидирует историю при каждом старте ({@code validateOnMigrate=true} по умолчанию) и падал:
 * «Detected applied migration not resolved locally: 14» — backend не поднимался вовсе. Совет
 * в README «удалите демо-юзеров» не лечил: {@code DELETE FROM users} не трогает историю
 * миграций.</p>
 *
 * <p>Тест воспроизводит ровно этот сценарий и проверяет remedy
 * ({@code spring.flyway.ignore-migration-patterns: "*:missing"}):</p>
 * <ol>
 *   <li>БД поднимается текущими миграциями, затем в историю ДОПИСЫВАЮТСЯ строки V14/V15 —
 *       состояние «volume владельца до git pull» (имена скриптов реконструированы: важны
 *       номера версий, а не текст — Flyway сверяет наличие резолва, а содержимое удалено);</li>
 *   <li>Spring-контекст стартует поверх этой БД — если remedy убрать, контекст не загрузится
 *       и тест упадёт на старте, а не «где-то в assertions»;</li>
 *   <li>негативный контроль: Flyway БЕЗ ignore-паттернов ту же БД отклоняет — сценарий
 *       настоящий, а не декоративный;</li>
 *   <li>{@code ignore} не равен {@code repair}: строки V14/V15 остались в истории, а миграция
 *       текущего дерева применена;</li>
 *   <li>приложение рабочее: {@code GET /api/v1/meta} → 200 (критерий приёмки AU-02).</li>
 * </ol>
 *
 * <p>Максимальная версия дерева определяется по classpath, а не хардкодом, — тест не устаревает
 * с каждой новой миграцией. Системный гейт того же требования AGENTS R6 — CI-job
 * {@code migration-upgrade} (подъём БД предыдущей версией, затем текущим backend).</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ContainerSuite
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("AU-02: апгрейд существующей БД с удалёнными V14/V15 в истории")
class FlywayUpgradeIntegrationTest {

    private static final String DB_NAME = "provision_upgrade_test";
    /** Удалённые из дерева миграции: номер → (описание, имя скрипта), как их видит история БД. */
    private static final List<String[]> REMOVED_MIGRATIONS = List.of(
            new String[]{"14", "seed demo users", "V14__seed_demo_users.sql"},
            new String[]{"15", "seed demo trips", "V15__seed_demo_trips.sql"});

    /** Docker есть → Testcontainers; нет → локальный кластер PostgreSQL (LocalPgFallback). */
    private static final boolean LOCAL_PG = !LocalPgFallback.dockerAvailable();

    static PostgreSQLContainer<?> postgres = LOCAL_PG ? null
            : new PostgreSQLContainer<>("postgres:15-alpine")
                    .withDatabaseName(DB_NAME)
                    .withUsername("test")
                    .withPassword("test");

    private static final String URL;
    private static final String USER;
    private static final String PASSWORD;
    private static final String CURRENT_MAX_VERSION;

    static {
        if (!LOCAL_PG && postgres != null && !postgres.isRunning()) {
            postgres.start();
        }
        URL = LOCAL_PG ? LocalPgFallback.jdbcUrl(DB_NAME) : postgres.getJdbcUrl();
        USER = LOCAL_PG ? "test" : postgres.getUsername();
        PASSWORD = LOCAL_PG ? "test" : postgres.getPassword();
        CURRENT_MAX_VERSION = currentMaxVersion();
        // ДО старта Spring-контекста: приложение обязано увидеть уже «старую» БД.
        seedDatabaseOfPreviousDeployment();
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> URL);
        registry.add("spring.datasource.username", () -> USER);
        registry.add("spring.datasource.password", () -> PASSWORD);
    }

    @Autowired
    private Flyway flyway;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MockMvc mockMvc;

    /**
     * Состояние «деплой до 28.10.2026»: схема накатана текущими миграциями, а в истории —
     * строки V14/V15, файлов которых в дереве больше нет.
     */
    private static void seedDatabaseOfPreviousDeployment() {
        Flyway.configure()
                .dataSource(URL, USER, PASSWORD)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                // Не гейт, а подготовка состояния: на повторном прогоне в истории уже лежат
                // синтетические V14/V15, и валидация без ignore-паттерна упала бы здесь,
                // не дойдя до проверки remedy в конфигурации приложения.
                .ignoreMigrationPatterns("*:missing")
                .load()
                .migrate();

        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD);
             Statement st = c.createStatement()) {
            for (String[] removed : REMOVED_MIGRATIONS) {
                // Идемпотентно: локальный кластер PG переживает прогоны (а в CI БД свежая),
                // поэтому строка версии добавляется только если её ещё нет. Ранг — скалярным
                // подзапросом: с `FROM flyway_schema_history WHERE NOT EXISTS (...)` агрегат
                // вернул бы строку с MAX=NULL даже когда вставлять нечего.
                st.executeUpdate("""
                        INSERT INTO flyway_schema_history
                            (installed_rank, version, description, type, script, checksum,
                             installed_by, execution_time, success)
                        SELECT (SELECT COALESCE(MAX(installed_rank), 0) + 1 FROM flyway_schema_history),
                               '%s', '%s', 'SQL', '%s', 123456789, 'provision', 7, true
                        WHERE NOT EXISTS (SELECT 1 FROM flyway_schema_history h
                                          WHERE h.version = '%s')
                        """.formatted(removed[0], removed[1], removed[2], removed[0]));
            }
        } catch (SQLException e) {
            throw new IllegalStateException(
                    "Не удалось воспроизвести БД предыдущего деплоя (V14/V15 в истории)", e);
        }
    }

    /** Максимальный номер миграции в текущем дереве — по classpath, без хардкода версии. */
    private static String currentMaxVersion() {
        try {
            Resource[] migrations = new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:db/migration/V*__*.sql");
            assertThat(migrations).as("миграции найдены в classpath").isNotEmpty();
            int max = 0;
            for (Resource migration : migrations) {
                String name = migration.getFilename();
                if (name == null) {
                    continue;
                }
                String digits = name.substring(1, name.indexOf("__"));
                max = Math.max(max, Integer.parseInt(digits));
            }
            return String.valueOf(max);
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("Не удалось определить максимальную версию миграций", e);
        }
    }

    @Test
    @Order(1)
    @DisplayName("конфигурация приложения принимает БД с V14/V15 в истории: flyway.validate() зелёный")
    void validatesDatabaseWithRemovedMigrationsInHistory() {
        assertThat(CURRENT_MAX_VERSION).as("в дереве есть миграции").isNotEqualTo("0");
        assertThatCode(() -> flyway.validate()).doesNotThrowAnyException();
    }

    @Test
    @Order(2)
    @DisplayName("негативный контроль: Flyway без ignore-migration-patterns ту же БД отклоняет")
    void strictFlywayRejectsTheSameDatabase() {
        Flyway strict = Flyway.configure()
                .dataSource(URL, USER, PASSWORD)
                .locations("classpath:db/migration")
                .load();

        assertThatThrownBy(strict::validate)
                .hasMessageContaining("14");
    }

    @Test
    @Order(3)
    @DisplayName("ignore ≠ repair: история не переписана, V14/V15 на месте, текущая миграция применена")
    void keepsHistoryAndAppliesCurrentMigrations() {
        List<String> applied = jdbc.queryForList(
                "SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank",
                String.class);

        assertThat(applied).contains("14", "15");
        assertThat(applied).as("апгрейд довёл схему до текущего дерева").contains(CURRENT_MAX_VERSION);
        assertThat(applied).doesNotContainNull();
    }

    @Test
    @Order(4)
    @DisplayName("приложение после апгрейда рабочее: GET /api/v1/meta → 200")
    void servesMetaAfterUpgrade() throws Exception {
        mockMvc.perform(get("/api/v1/meta"))
                .andExpect(status().isOk());
    }
}
