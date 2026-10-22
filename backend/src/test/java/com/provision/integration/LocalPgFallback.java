package com.provision.integration;

import org.testcontainers.DockerClientFactory;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;

/**
 * Fallback для окружений без Docker-демона (CI-сэндбоксы, sandboxed runners).
 *
 * Если Testcontainers не может достучаться до Docker, поднимаем локальный кластер
 * PostgreSQL (pg_ctl из /usr/lib/postgresql/&lt;ver&gt;/bin) и возвращаем JDBC-URL на отдельную
 * БД со своим схемой-пространством. Flyway в тестах (application-test.yml) накатывает
 * миграции V1..Vn поверх пустой БД — как и в настоящем контейнере.
 *
 * Использование в тестах:
 *   static PostgreSQLContainer<?> postgres = ...;
 *   registry.add("spring.datasource.url", () -> LocalPgFallback.jdbcUrlOr(postgres::getJdbcUrl));
 * но чтобы не менять сигнатуры @DynamicPropertySource во всех классах, применяем
 * helper {@link #url(PostgreSQLContainer)} c try/catch внутри.
 */
public final class LocalPgFallback {

    private static final String PG_BIN = detectPgBin();
    private static final String DATA_DIR = System.getProperty("java.io.tmpdir") + "/ltc-pgdata";
    private static final int PORT = Integer.getInteger("ltc.pg.port", 5433);
    private static final String SUPERUSER = "test";
    private static final String INITDB_LOG = System.getProperty("java.io.tmpdir") + "/ltc-initdb.log";
    private static final String PG_LOG = System.getProperty("java.io.tmpdir") + "/ltc-pg.log";

    private static Boolean dockerAvailable;

    private LocalPgFallback() {}

    /** Есть ли рабочий Docker-демон (кэшируется). */
    public static synchronized boolean dockerAvailable() {
        if (dockerAvailable == null) {
            try {
                dockerAvailable = DockerClientFactory.instance().isDockerAvailable();
            } catch (Throwable t) {
                dockerAvailable = false;
            }
        }
        return dockerAvailable;
    }

    /**
     * JDBC-URL: реальный контейнер если Docker доступен, иначе локальный кластер
     * с выделенной БД {@code dbname}. Пустые строки Flyway-локов не трогаем —
     * схема поднимается миграциями.
     */
    public static String jdbcUrl(String dbname) {
        try {
            ensureClusterUp();
            ensureDatabase(dbname);
            // FIX: initdb без --locale=C поднимает кластер с encoding='SQL_ASCII' (в минимальных
            // контейнерах LANG не задан). Тогда JDBC-драйвер отдаёт строки как bytea и запросы
            // вида lower(r.name) падают с "ERROR: function lower(bytea) does not exist".
            // Приводим тестовую БД к UTF8, как в реальном postgres:15-alpine.
            fixEncodingIfNeeded(dbname);
            return "jdbc:postgresql://localhost:" + PORT + "/" + dbname;
        } catch (Exception e) {
            throw new RuntimeException("Local PostgreSQL fallback failed for db '" + dbname + "'", e);
        }
    }

    private static void fixEncodingIfNeeded(String dbname) throws Exception {
        try (Connection c = DriverManager.getConnection(
                "jdbc:postgresql://localhost:" + PORT + "/postgres", SUPERUSER, "");
             Statement st = c.createStatement()) {
            var rs = st.executeQuery("SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname='" + dbname + "'");
            if (rs.next() && !"UTF8".equals(rs.getString(1))) {
                st.execute("UPDATE pg_database SET datcollate='C.UTF-8', datctype='C.UTF-8' WHERE datname='" + dbname + "'");
                st.execute("ALTER DATABASE \"" + dbname + "\" REFRESH COLLATION VERSION");
                st.execute("ALTER DATABASE \"" + dbname + "\" WITH encoding='UTF8' lc_collate='C.UTF-8' lc_ctype='C.UTF-8' template=template0");
            }
        }
    }

    private static synchronized void ensureClusterUp() throws Exception {
        java.nio.file.Files.createDirectories(java.nio.file.Path.of(DATA_DIR));
        if (isServerReachable()) return; // кластер уже поднят (возможно, другим проготом/сессией) — переиспользуем
        boolean fresh = !java.nio.file.Files.exists(java.nio.file.Path.of(DATA_DIR, "PG_VERSION"));
        if (fresh) {
            chownDir();
            freshLogFile(INITDB_LOG);
            asPgPostgres(PG_BIN + "/initdb -D " + DATA_DIR + " -U " + SUPERUSER + " --auth=trust > " + INITDB_LOG + " 2>&1");
        }
        freshLogFile(PG_LOG);
        asPgPostgres(PG_BIN + "/pg_ctl -D " + DATA_DIR + " -w -o \"-p " + PORT + " -k " + System.getProperty("java.io.tmpdir") + "\" -l " + PG_LOG + " start");
        Thread.sleep(1000);
    }

    /** TCP-проверка: сервер на нашем порту уже слушает? */
    private static boolean isServerReachable() {
        try (java.net.Socket s = new java.net.Socket()) {
            s.connect(new java.net.InetSocketAddress("localhost", PORT), 300);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Пересоздаём лог-файл с правами на запись (старый мог принадлежать другому пользователю). */
    private static void freshLogFile(String path) {
        try {
            java.nio.file.Files.deleteIfExists(java.nio.file.Path.of(path));
            shell("touch " + path + " && chmod 666 " + path);
        } catch (Exception ignored) {}
    }

    private static void ensureDatabase(String dbname) throws Exception {
        try (Connection c = DriverManager.getConnection(
                "jdbc:postgresql://localhost:" + PORT + "/postgres", SUPERUSER, "");
             Statement st = c.createStatement()) {
            var rs = st.executeQuery("SELECT 1 FROM pg_database WHERE datname='" + dbname + "'");
            if (!rs.next()) {
                st.execute("CREATE DATABASE \"" + dbname + "\"");
            }
        }
    }

    private static String detectPgBin() {
        String env = System.getenv("PG_BIN");
        if (env != null && !env.isBlank()) return env;
        // pick highest installed major
        try {
            var dirs = java.nio.file.Files.list(java.nio.file.Path.of("/usr/lib/postgresql"))
                    .filter(java.nio.file.Files::isDirectory)
                    .sorted((a, b) -> b.getFileName().toString().compareTo(a.getFileName().toString()))
                    .map(p -> p.resolve("bin").toString())
                    .filter(p -> java.nio.file.Files.exists(java.nio.file.Path.of(p, "pg_ctl")))
                    .findFirst();
            if (dirs.isPresent()) return dirs.get();
        } catch (Exception ignored) {}
        return "/usr/lib/postgresql/15/bin";
    }

    private static void chownDir() {
        try {
            shell("chown -R postgres:postgres " + DATA_DIR + " 2>/dev/null || true");
        } catch (Exception ignored) {}
    }

    private static void asPgPostgres(String cmd) throws Exception {
        // run as 'postgres' OS user when we're root (initdb refuses to run as root)
        boolean isRoot = "root".equals(System.getProperty("user.name"));
        String full = isRoot ? "su postgres -c '" + cmd.replace("'", "'\\''") + "'" : cmd;
        shell(full);
    }

    private static String shell(String cmd) throws Exception {
        Process p = new ProcessBuilder("bash", "-c", cmd).redirectErrorStream(true).start();
        String out = new String(p.getInputStream().readAllBytes());
        int rc = p.waitFor();
        if (rc != 0 && !cmd.contains("|| true") && !cmd.contains("status")) {
            throw new RuntimeException("shell failed (" + rc + "): " + cmd + "\n" + out);
        }
        return out;
    }
}
