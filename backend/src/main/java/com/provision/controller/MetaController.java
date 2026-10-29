package com.provision.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * CR-5.1: health endpoint для авто-детекта режима (mock vs real)
 * P3#5: честная проверка БД — "db" отражает реальный статус подключения,
 * при недоступной БД возвращается HTTP 503 (healthcheck контейнера поймает).
 * Не требует авторизации.
 *
 * FIX (аудит 29.10.2026, подзадача 10): эндпоинт публичный, поэтому отдаёт минимум:
 * version — из app.version (pom/APP_VERSION), build — МОМЕНТ СТАРТА приложения
 * (раньше возвращал LocalDateTime.now() на каждый запрос — бессмыслица и лишний
 * канал утечки серверных часов), db — ok/down без деталей ошибки. Внутренности
 * (стектрейсы, настройки, версии БД) не отдаются; причина падения проверки БД —
 * только в серверный лог (R10).
 */
@RestController
@RequestMapping("/api/v1/meta")
@Slf4j
public class MetaController {

    @Value("${spring.application.name:provision}")
    private String appName;

    @Value("${app.version:dev}")
    private String appVersion;

    /** Фиксируется один раз при создании бина — не «плавает» от запроса к запросу. */
    private final LocalDateTime startedAt = LocalDateTime.now();

    private final DataSource dataSource;

    public MetaController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getMeta() {
        boolean dbUp = checkDb();

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("version", appVersion);
        meta.put("build", startedAt.toString());
        meta.put("db", dbUp ? "ok" : "down");
        meta.put("application", appName);

        return dbUp
            ? ResponseEntity.ok(meta)
            : ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(meta);
    }

    /**
     * Реальная проверка доступности БД: берём соединение из пула и
     * валидируем его с таймаутом 2 секунды. Причина отказа — в лог, не в ответ.
     */
    private boolean checkDb() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(2);
        } catch (Exception e) {
            log.warn("Meta DB check failed: {}", e.getMessage());
            return false;
        }
    }
}
