package com.provision.exception;

/**
 * Внешний интеграционный сервис недоступен или ответил не тем, что ожидаем
 * (сетевая ошибка, 403 анти-бота, HTML вместо данных, изменившаяся разметка).
 * Это НЕ баг Provision — отдаём клиенту понятный 502 Bad Gateway вместо 500.
 *
 * <p>Fix-13: заменила OFF-специфичную IntegrationAuthException вместе
 * с демонтированной интеграцией Open Food Facts.</p>
 */
public class IntegrationUnavailableException extends RuntimeException {

    public IntegrationUnavailableException(String message) {
        super(message);
    }

    public IntegrationUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
