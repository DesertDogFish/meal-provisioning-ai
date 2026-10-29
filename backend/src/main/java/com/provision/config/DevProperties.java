package com.provision.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Настройки dev-профиля (сид демо-данных).
 *
 * FIX (аудит 29.10.2026, plans/2026-10-29-full-audit.md подзадача 1, CRITICAL):
 * пароли демо-пользователей больше НЕ хардкодятся в исходниках. Значения читаются
 * из переменных окружения (ADMIN_PASSWORD / DEMO_USER_PASSWORD, см. application.yml);
 * пустое значение — сигнал сгенерировать случайный пароль при старте
 * ({@link DevDataInitializer}).
 *
 * Регистрируется через {@code @EnableConfigurationProperties} в {@link DevDataInitializer}
 * (@Profile("dev")), поэтому в prod-контексте бин не создаётся вовсе.
 */
@ConfigurationProperties(prefix = "dev")
@Getter
@Setter
public class DevProperties {

    /** Включён ли сид демо-пользователей (env SEED_DEMO_USERS). */
    private boolean seedDemoUsers = false;

    /** Пароль демо-админа admin@provision.app (env ADMIN_PASSWORD). Пусто — случайный. */
    private String adminPassword = "";

    /** Пароль демо-пользователя user@provision.app (env DEMO_USER_PASSWORD). Пусто — случайный. */
    private String userPassword = "";
}
