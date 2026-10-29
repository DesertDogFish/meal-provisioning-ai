package com.provision.config;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "jwt")
@Getter
@Setter
public class JwtProperties {
    private String secret;
    private long accessTokenExpiration;
    private long refreshTokenExpiration;

    /**
     * Издатель токенов (claim iss) — аудит 29.10.2026, подзадача 5.
     * Проверяется при каждом разборе: токен чужого сервиса (даже подписанный
     * совместимым ключом) отклоняется.
     */
    private String issuer = "provision";

    /** Audience токенов (claim aud) — см. issuer. */
    private String audience = "provision-api";

    /**
     * Fail-fast: не даём приложению стартовать с пустым или слишком коротким секретом.
     * HS256 требует минимум 256 бит (32 символа); иначе ключ небезопасен,
     * а с пустым секретом подпись токенов вообще невозможна.
     */
    @PostConstruct
    void validate() {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                "JWT_SECRET is not set. Copy .env.example to .env and set a unique JWT_SECRET " +
                "(generate one with: openssl rand -base64 48).");
        }
        if (secret.getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                "JWT_SECRET is too short: at least 32 bytes required for HS256.");
        }
    }
}
