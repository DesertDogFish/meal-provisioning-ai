package com.provision.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @NotBlank @Email @Size(max = 255)
    String email,
    
    // Подзадача 4.5 аудита 02.11.2026: min 6 → 8 (NIST SP 800-63B: минимум 8,
    // рекомендация до 64+). Сообщение — в шаблон humanizeFieldError на фронте
    // («Пароль: от 8 до 100 символов»); существующие пользователи не затрагиваются
    // (проверка только при регистрации/смене пароля).
    @NotBlank @Size(min = 8, max = 100, message = "size must be between 8 and 100 characters")
    String password,
    
    @NotBlank @Size(min = 1, max = 100)
    String firstName,
    
    @NotBlank @Size(min = 1, max = 100)
    String lastName
) {}
