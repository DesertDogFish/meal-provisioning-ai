package com.provision.integration;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

/**
 * Гарантирует, что общий PostgreSQL-сервер поднят до старта Spring-контекста класса.
 *
 * Сам сервер один на JVM и живёт в {@link SharedPostgres}: раньше каждый класс поднимал
 * свой контейнер {@code postgres:15-alpine} (21 пуск за сьют), теперь — один пуск,
 * а изоляция обеспечивается отдельной базой на класс.
 */
public class ContainerSuiteExtension implements BeforeAllCallback {

    @Override
    public void beforeAll(ExtensionContext context) {
        SharedPostgres.ensureRunning();
    }
}
