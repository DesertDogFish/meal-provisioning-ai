package com.provision.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * CR-5.1: health endpoint для авто-детекта режима (mock vs real)
 * Не требует авторизации
 */
@RestController
@RequestMapping("/api/v1/meta")
public class MetaController {

    @Value("${spring.application.name:provision}")
    private String appName;

    @GetMapping
    public Map<String, Object> getMeta() {
        return Map.of(
            "version", "1.0.0",
            "build", LocalDateTime.now().toString(),
            "db", "ok",
            "application", appName
        );
    }
}
