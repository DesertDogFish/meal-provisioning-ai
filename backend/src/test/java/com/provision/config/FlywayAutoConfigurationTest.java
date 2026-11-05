package com.provision.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.util.ClassUtils;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Boot 4 размодулировал автоконфигурацию: {@code flyway-core} сам по себе больше не
 * регистрирует бин {@link org.flywaydb.core.Flyway}. Нужен модуль {@code spring-boot-flyway}
 * (стартер {@code spring-boot-starter-flyway}).
 *
 * <p>Симптом отсутствия модуля: приложение стартует «успешно» до Hibernate, миграции не
 * выполняются, а затем {@code ddl-auto=validate} падает на
 * {@code Schema validation: missing table [emis_prices]} (Docker, 05.11.2026).</p>
 */
class FlywayAutoConfigurationTest {

    @Test
    @DisplayName("spring-boot-flyway автоконфигурация на classpath (Boot 4 modularization)")
    void flywayAutoConfigurationIsPresent() {
        assertThat(ClassUtils.isPresent(
                "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
                getClass().getClassLoader()))
                .as("spring-boot-flyway module is required in Boot 4: "
                        + "flyway-core alone does not register a Flyway bean")
                .isTrue();
    }
}
