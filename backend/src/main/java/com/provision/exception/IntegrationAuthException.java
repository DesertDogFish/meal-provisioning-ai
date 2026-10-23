package com.provision.exception;

/**
 * Аутентификация во внешнем интеграционном API (Open Food Facts) отклонена:
 * 401/403 при переданных креденшелах. Это НЕ баг Provision — проблема учётной
 * записи OFF, поэтому отдаём клиенту понятный 502 Bad Gateway вместо 500.
 */
public class IntegrationAuthException extends RuntimeException {

    public IntegrationAuthException(String message) {
        super(message);
    }

    public IntegrationAuthException(String message, Throwable cause) {
        super(message, cause);
    }
}
