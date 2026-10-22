package com.provision.integration;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.testcontainers.containers.PostgreSQLContainer;

/** Запускает контейнер вручную (когда Docker есть) либо оставляет LOCAL_PG-путь. */
public class ContainerSuiteExtension implements BeforeAllCallback {

    @Override
    public void beforeAll(ExtensionContext context) {
        Class<?> testClass = context.getRequiredTestClass();
        for (var field : testClass.getDeclaredFields()) {
            if (PostgreSQLContainer.class.isAssignableFrom(field.getType())) {
                try {
                    field.setAccessible(true);
                    PostgreSQLContainer<?> c = (PostgreSQLContainer<?>) field.get(null);
                    if (c != null && !c.isRunning()) {
                        c.start();
                        Runtime.getRuntime().addShutdownHook(new Thread(c::stop));
                    }
                } catch (ReflectiveOperationException e) {
                    throw new IllegalStateException(e);
                }
            }
        }
    }
}
