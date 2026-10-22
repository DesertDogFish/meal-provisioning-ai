package com.provision.controller;

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
 */
@RestController
@RequestMapping("/api/v1/meta")
public class MetaController {

    @Value("${spring.application.name:provision}")
    private String appName;

    private final DataSource dataSource;

    public MetaController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getMeta() {
        boolean dbUp = checkDb();

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("version", "1.0.0");
        meta.put("build", LocalDateTime.now().toString());
        meta.put("db", dbUp ? "ok" : "down");
        meta.put("application", appName);

        return dbUp
            ? ResponseEntity.ok(meta)
            : ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(meta);
    }

    /**
     * Реальная проверка доступности БД: берём соединение из пула и
     * валидируем его с таймаутом 2 секунды.
     */
    private boolean checkDb() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(2);
        } catch (Exception e) {
            return false;
        }
    }
}
