package com.provision.integration;

import org.testcontainers.containers.PostgreSQLContainer;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Один PostgreSQL-сервер на весь тестовый JVM.
 *
 * Раньше каждый интеграционный класс поднимал СВОЙ контейнер {@code postgres:15-alpine}
 * (~3 с на класс, 21 класс) — почти минута на пуск контейнеров, которые отличаются только
 * именем базы. Теперь контейнер один, а изоляция между классами — по имени базы:
 * {@code provision_test_auth}, {@code provision_test_catalog}, ...
 *
 * Docker недоступен → прежний путь {@link LocalPgFallback} (локальный кластер {@code pg_ctl}),
 * он тоже обслуживает все базы одного сервера.
 */
public final class SharedPostgres {

    private static final String USER = "test";
    private static final String PASSWORD = "test";

    /** Docker нет — работаем через LocalPgFallback (initdb/pg_ctl). */
    private static final boolean LOCAL = !LocalPgFallback.dockerAvailable();

    private static final Set<String> CREATED = ConcurrentHashMap.newKeySet();
    private static PostgreSQLContainer<?> container;

    private SharedPostgres() {}

    /** JDBC-URL базы {@code database}; сервер и база создаются при первом обращении. */
    public static String jdbcUrl(String database) {
        if (LOCAL) {
            return LocalPgFallback.jdbcUrl(database);
        }
        ensureDatabase(database);
        return baseUrl() + "/" + database + "?characterEncoding=UTF-8";
    }

    public static String username() {
        return USER;
    }

    public static String password() {
        return PASSWORD;
    }

    /** Поднимает общий контейнер (идемпотентно). */
    public static void ensureRunning() {
        if (!LOCAL) {
            baseUrl();
        }
    }

    private static String baseUrl() {
        synchronized (SharedPostgres.class) {
            if (container == null) {
                container = new PostgreSQLContainer<>("postgres:15-alpine")
                        // Контексты всех @SpringBootTest классов живут в кэше Spring до конца
                        // прогона, каждый со своим пулом Hikari: на общем сервере 21 пул × 10
                        // соединений упирается в дефолтный max_connections=100
                        // («sorry, too many clients already»).
                        .withCommand("postgres", "-c", "max_connections=400")
                        .withDatabaseName("postgres")
                        .withUsername(USER)
                        .withPassword(PASSWORD);
                container.start();
                Runtime.getRuntime().addShutdownHook(new Thread(container::stop));
            }
            return "jdbc:postgresql://" + container.getHost() + ":" + container.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT);
        }
    }

    /** CREATE DATABASE для класса — один раз на JVM, копия template1 (UTF8 по умолчанию). */
    private static void ensureDatabase(String database) {
        if (!CREATED.add(database)) {
            return;
        }
        String server = baseUrl();
        String adminUrl = server + "/postgres?characterEncoding=UTF-8";
        try (Connection admin = DriverManager.getConnection(adminUrl, USER, PASSWORD);
             Statement st = admin.createStatement()) {
            try (ResultSet rs = st.executeQuery("SELECT 1 FROM pg_database WHERE datname='" + database + "'")) {
                if (rs.next()) {
                    return;
                }
            }
            st.execute("CREATE DATABASE \"" + database + "\" WITH encoding='UTF8' TEMPLATE template0");
        } catch (SQLException e) {
            CREATED.remove(database);
            throw new IllegalStateException("Не удалось создать тестовую БД " + database, e);
        }
    }
}
