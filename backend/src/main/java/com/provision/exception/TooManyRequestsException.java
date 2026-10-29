package com.provision.exception;

/**
 * 429 Too Many Requests — превышен лимит попыток (аудит 29.10.2026, подзадача 19:
 * brute-force защита auth-эндпоинтов). Retry-After клиенту возвращает
 * {@link com.provision.exception.GlobalExceptionHandler}.
 */
public class TooManyRequestsException extends RuntimeException {

    private final long retryAfterSeconds;

    public TooManyRequestsException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
