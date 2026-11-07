package com.provision.integration;

import org.junit.jupiter.api.extension.ExtendWith;

import java.lang.annotation.*;

/**
 * Suite-аннотация для интеграционных тестов, которым нужен PostgreSQL.
 *
 * Поведение как у {@code @Testcontainers}, но: Docker есть -> один общий контейнер
 * на весь JVM ({@link SharedPostgres}), Docker недоступен -> {@link LocalPgFallback}
 * поднимает локальный кластер PostgreSQL (pg_ctl). Тесты никогда не скипаются молча —
 * либо реальный контейнер, либо локальный PG, те же Flyway-миграции V1..Vn.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@ExtendWith(ContainerSuiteExtension.class)
public @interface ContainerSuite {
}
