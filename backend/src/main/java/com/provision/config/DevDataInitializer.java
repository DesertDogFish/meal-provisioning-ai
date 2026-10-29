package com.provision.config;

import com.provision.entity.User;
import com.provision.entity.UserRole;
import com.provision.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.security.SecureRandom;

/**
 * Сид демо-пользователей: только dev-профиль и только при dev.seed-demo-users=true
 * (env SEED_DEMO_USERS).
 *
 * FIX (аудит 29.10.2026, plans/2026-10-29-full-audit.md подзадача 1, CRITICAL):
 * прежний статический демо-пароль больше не хардкодится. Пароли читаются из
 * {@link DevProperties} (env ADMIN_PASSWORD / DEMO_USER_PASSWORD); если переменная
 * не задана — при старте генерируется криптографически случайный пароль
 * (SecureRandom, 16 символов) и ВЫВОДИТСЯ В ЛОГ. Лог dev-профиля — локальный
 * инструмент разработчика, поэтому печать сгенерированного пароля допустима
 * и является единственным способом узнать его.
 */
@Configuration
@Profile("dev")
@EnableConfigurationProperties(DevProperties.class)
@Slf4j
public class DevDataInitializer {

    /** Алфавит без визуально неоднозначных символов (0/O, 1/l/I). */
    private static final String PASSWORD_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    private static final int GENERATED_PASSWORD_LENGTH = 16;
    private static final SecureRandom RANDOM = new SecureRandom();

    @Bean
    @Order(1)
    CommandLineRunner seedDevUsers(UserRepository userRepository,
                                   PasswordEncoder passwordEncoder,
                                   DevProperties devProperties) {
        return args -> {
            if (!devProperties.isSeedDemoUsers()) {
                log.info("Demo users seeding disabled (set SEED_DEMO_USERS=true to enable)");
                return;
            }

            seedUser(userRepository, passwordEncoder, "admin@provision.app",
                    resolvePassword(devProperties.getAdminPassword(), "ADMIN_PASSWORD", "admin@provision.app"),
                    "Admin User", UserRole.ADMIN);
            seedUser(userRepository, passwordEncoder, "user@provision.app",
                    resolvePassword(devProperties.getUserPassword(), "DEMO_USER_PASSWORD", "user@provision.app"),
                    "Regular User", UserRole.USER);
        };
    }

    /**
     * Пароль из конфига; если пустой — генерируем случайный и логируем (R10:
     * по логу старта видно, каким паролем засеян демо-пользователь).
     */
    private String resolvePassword(String configured, String envName, String email) {
        if (configured != null && !configured.isBlank()) {
            log.info("Demo password for {} taken from {} ", email, envName);
            return configured;
        }
        String generated = generateRandomPassword();
        log.warn("{} is not set — generated random demo password for {}: {} "
                + "(set {} to use a fixed password)", envName, email, generated, envName);
        return generated;
    }

    static String generateRandomPassword() {
        StringBuilder sb = new StringBuilder(GENERATED_PASSWORD_LENGTH);
        for (int i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
            sb.append(PASSWORD_ALPHABET.charAt(RANDOM.nextInt(PASSWORD_ALPHABET.length())));
        }
        return sb.toString();
    }

    private void seedUser(UserRepository userRepository, PasswordEncoder passwordEncoder,
                          String email, String password, String name, UserRole role) {
        if (userRepository.findByEmail(email).isEmpty()) {
            User user = User.builder()
                    .email(email)
                    // Пароль всегда хэшируется BCrypt (подзадача 2 аудита: сид не минует encoder)
                    .passwordHash(passwordEncoder.encode(password))
                    .firstName(name)
                    .lastName("")
                    .role(role)
                    .build();
            userRepository.save(user);
            log.info("Created demo user: {} (role={})", email, role);
        } else {
            log.info("Demo user already exists, skipping: {}", email);
        }
    }
}
