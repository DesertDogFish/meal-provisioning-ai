package com.provision.integration;

import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Изоляция данных интеграционных тестов.
 *
 * Проблема: в @BeforeEach делали userRepository.deleteAll(), но каталог (recipes/ingredients,
 * ~50 блюд) накатывается Flyway-сидом V3/V4 и НЕ должен удаляться — иначе CAT-тесты получают
 * пустой каталог (500/NPE), а ING-тесты падают на 409 "name already exists" от сида.
 * Одновременно users нельзя чистить через deleteAll() при непустых recipes/trips —
 * FK users(id) RESTRICT не даёт (раньше это давало 500 в SEC-02).
 *
 * Решение: перед каждым тестом БД приводится к состоянию «сразу после миграций V1..Vn».
 *
 * Раньше это был DROP SCHEMA + полный {@code flyway migrate} на каждый тест. Замер
 * (06.11.2026, 29 тестов трёх самых медленных классов): 1.32 с на reset, 38.2 с из 64.6 с —
 * ~60 % времени интеграционных классов уходило на повторные миграции.
 *
 * Теперь миграции накатываются один раз в шаблонную БД {@code <db>_tpl}, а reset — это
 * {@code DROP DATABASE <db> WITH (FORCE)} + {@code CREATE DATABASE <db> TEMPLATE <db>_tpl}.
 * PostgreSQL делает такую копию на уровне файлов, без повторного выполнения DDL/сида.
 *
 * Каждый класс живёт в своей базе (provision_test_auth/_catalog/...), параллельных прогонов
 * внутри одной базы нет. Пул соединений выгоняется перед DROP DATABASE — иначе FORCE убивает
 * соединения посреди работы Hikari и тест получает «connection is closed».
 */
public final class TestDataIsolation {

    /** Базы этого JVM, для которых шаблон уже построен: db -> имя шаблона. */
    private static final Map<String, String> TEMPLATES = new ConcurrentHashMap<>();

    /** {@code jdbc:postgresql://host:port/db?...} -> {@code jdbc:postgresql://host:port} */
    private static final Pattern HOST_PART = Pattern.compile("^(jdbc:postgresql://[^/?]+)/.*$");

    private TestDataIsolation() {}

    /**
     * Детерминированное состояние «сразу после миграций» (со сидом каталога).
     * Первый вызов в JVM строит шаблонную БД, последующие копируют её.
     */
    public static void reset(JdbcTemplate jdbc, Flyway flyway) {
        String db = jdbc.queryForObject("SELECT current_database()", String.class);
        DataSource dataSource = jdbc.getDataSource();
        String template = TEMPLATES.computeIfAbsent(db, name -> createTemplate(dataSource, flyway, name));
        try {
            copyTemplate(dataSource, db, template);
        } catch (SQLException e) {
            // Шаблон пропал (новый кластер/том) или копирование упёрлось в открытые сессии —
            // откатываемся на прежний, всегда корректный путь: drop-all + migrate.
            TEMPLATES.remove(db);
            rebuildSchema(jdbc, flyway);
        }
    }

    /** Пустая база-шаблон + полный прогон миграций в неё. Один раз на класс на JVM. */
    private static String createTemplate(DataSource dataSource, Flyway flyway, String db) {
        String template = db + "_tpl";
        try (Connection admin = adminConnection(dataSource); Statement st = admin.createStatement()) {
            st.execute("DROP DATABASE IF EXISTS \"" + template + "\" WITH (FORCE)");
            st.execute("CREATE DATABASE \"" + template + "\"");
        } catch (SQLException e) {
            throw new IllegalStateException("Не удалось создать шаблонную БД " + template, e);
        }
        Flyway.configure()
                .configuration(flyway.getConfiguration())
                .dataSource(urlWithDatabase(dataSource, template), username(dataSource), password(dataSource))
                .load()
                .migrate();
        return template;
    }

    /** Копия шаблона поверх рабочей базы класса. */
    private static void copyTemplate(DataSource dataSource, String db, String template) throws SQLException {
        try (Connection admin = adminConnection(dataSource); Statement st = admin.createStatement()) {
            st.execute("DROP DATABASE IF EXISTS \"" + db + "\" WITH (FORCE)");
            st.execute("CREATE DATABASE \"" + db + "\" TEMPLATE \"" + template + "\"");
        }
        // Вытесняем пул ТОЛЬКО после пересоздания БД: до неё Hikari успевает дозалить
        // соединения, FORCE их убивает, а проверка на живность пропускается
        // (aliveBypassWindow 500 мс) — тест получает «connection aborted».
        evictPoolConnections(dataSource);
    }

    /** Прежний путь: drop-all + полный прогон миграций в рабочую базу. */
    private static void rebuildSchema(JdbcTemplate jdbc, Flyway flyway) {
        jdbc.execute("DROP SCHEMA IF EXISTS public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        flyway.migrate();
    }

    private static void evictPoolConnections(DataSource dataSource) {
        try {
            if (dataSource.isWrapperFor(HikariDataSource.class)) {
                var pool = dataSource.unwrap(HikariDataSource.class).getHikariPoolMXBean();
                if (pool != null) {
                    pool.softEvictConnections();
                }
            }
        } catch (Exception ignored) {
            // не-Hikari пул: DROP DATABASE WITH (FORCE) закроет соединения сам
        }
    }

    private static Connection adminConnection(DataSource dataSource) throws SQLException {
        return DriverManager.getConnection(urlWithDatabase(dataSource, "postgres"), username(dataSource), password(dataSource));
    }

    private static String urlWithDatabase(DataSource dataSource, String database) {
        String url = jdbcUrl(dataSource);
        Matcher m = HOST_PART.matcher(url);
        if (!m.matches()) {
            throw new IllegalStateException("Не разобрать JDBC URL: " + url);
        }
        return m.group(1) + "/" + database + "?characterEncoding=UTF-8";
    }

    private static String jdbcUrl(DataSource dataSource) {
        try {
            if (dataSource.isWrapperFor(HikariDataSource.class)) {
                return dataSource.unwrap(HikariDataSource.class).getJdbcUrl();
            }
        } catch (Exception ignored) {
            // fall through: ниже читаем из метаданных соединения
        }
        try (Connection c = dataSource.getConnection()) {
            return c.getMetaData().getURL();
        } catch (SQLException e) {
            throw new IllegalStateException("Не удалось получить JDBC URL тестовой БД", e);
        }
    }

    private static String username(DataSource dataSource) {
        try {
            if (dataSource.isWrapperFor(HikariDataSource.class)) {
                return dataSource.unwrap(HikariDataSource.class).getUsername();
            }
        } catch (Exception ignored) {
        }
        return "test";
    }

    private static String password(DataSource dataSource) {
        try {
            if (dataSource.isWrapperFor(HikariDataSource.class)) {
                String p = dataSource.unwrap(HikariDataSource.class).getPassword();
                return p == null ? "" : p;
            }
        } catch (Exception ignored) {
        }
        return "test";
    }
}
