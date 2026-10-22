package com.provision.integration;

import org.junit.jupiter.api.extension.ExtendWith;

import java.lang.annotation.*;

/**
 * Suite-аннотация для интеграционных тестов, требующих PostgreSQL-контейнер.
 *
 * Поведение как у {@code @Testcontainers}, но с fallback: если Docker-демон недоступен,
 * {@link LocalPgFallback} поднимает локальный кластер PostgreSQL (pg_ctl), и тесты
 * выполняются против него (те же Flyway-миграции V1..Vn). Тесты никогда не скипаются
 * молча — либо реальный контейнер, либо локальный PG.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@ExtendWith(ContainerSuiteExtension.class)
public @interface ContainerSuite {
}
