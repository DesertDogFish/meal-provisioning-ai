package com.provision.integration;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Изоляция данных интеграционных тестов.
 *
 * Проблема: в @BeforeEach делали userRepository.deleteAll(), но каталог (recipes/ingredients,
 * ~50 блюд) накатывается Flyway-сидом V3/V4 и НЕ должен удаляться — иначе CAT-тесты получают
 * пустой каталог (500/NPE), а ING-тесты падают на 409 "name already exists" от сида.
 * Одновременно users нельзя чистить через deleteAll() при непустых recipes/trips —
 * FK users(id) RESTRICT не даёт (раньше это давало 500 в SEC-02).
 *
 * Решение: перед каждым тестом полностью пересоздаём БД из миграций (drop+flyway migrate),
 * затем удаляем пользователей сырым SQL по каскаду зависимостей. Каждый класс живёт в
 * своей базе (provision_test_auth/_catalog/_conflict/_security), параллельных прогонов нет.
 */
public final class TestDataIsolation {

    private TestDataIsolation() {}

    /**
     * Чистая БД для теста: drop-all + полный прогон миграций V1..Vn (со сидом каталога).
     * Каждый интеграционный класс живёт в своей базе и не имеет конкурентных соединений,
     * поэтому DROP SCHEMA public CASCADE безопасен.
     */
    public static void reset(JdbcTemplate jdbc, org.flywaydb.core.Flyway flyway) {
        jdbc.execute("DROP SCHEMA IF EXISTS public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        flyway.migrate();
    }
}
