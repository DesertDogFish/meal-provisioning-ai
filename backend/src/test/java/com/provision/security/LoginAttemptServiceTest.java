package com.provision.security;

import com.provision.exception.TooManyRequestsException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit-тесты brute-force guard (аудит 29.10.2026, подзадача 19,
 * plans/2026-10-29-full-audit.md): порог, блокировка, сброс по успеху,
 * нормализация ключа, 429 + Retry-After.
 */
@DisplayName("LoginAttemptService: блокировка после серии неудач (аудит 19)")
class LoginAttemptServiceTest {

    private static final String EMAIL = "User@Example.COM ";

    private LoginAttemptService service;

    @BeforeEach
    void setUp() {
        service = new LoginAttemptService();
    }

    @Test
    @DisplayName("до порога (4 неудачи) — не блокирует")
    void belowThreshold_notBlocked() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS - 1; i++) {
            service.recordFailure(EMAIL);
        }
        assertThat(service.isBlocked(EMAIL)).isFalse();
        assertThatCode(() -> service.assertNotBlocked(EMAIL)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("пятая неудача — блокировка: assertNotBlocked бросает 429 с Retry-After")
    void atThreshold_blocked() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.recordFailure(EMAIL);
        }
        assertThat(service.isBlocked(EMAIL)).isTrue();
        assertThatThrownBy(() -> service.assertNotBlocked(EMAIL))
                .isInstanceOf(TooManyRequestsException.class)
                .satisfies(ex -> assertThat(((TooManyRequestsException) ex).getRetryAfterSeconds())
                        .isBetween(1L, (long) LoginAttemptService.LOCK_MINUTES * 60 + 1));
    }

    @Test
    @DisplayName("успешный логин сбрасывает счётчик")
    void successResets() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS - 1; i++) {
            service.recordFailure(EMAIL);
        }
        service.recordSuccess(EMAIL);

        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS - 1; i++) {
            service.recordFailure(EMAIL);
        }
        assertThat(service.isBlocked(EMAIL)).isFalse();
    }

    @Test
    @DisplayName("ключ нормализуется: регистр и пробелы не создают отдельные счётчики")
    void keyNormalized() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.recordFailure("  user@example.com");
        }
        assertThat(service.isBlocked("USER@EXAMPLE.COM ")).isTrue();
    }

    @Test
    @DisplayName("разные email блокируются независимо")
    void independentPerEmail() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.recordFailure("a@example.com");
        }
        assertThat(service.isBlocked("a@example.com")).isTrue();
        assertThat(service.isBlocked("b@example.com")).isFalse();
    }

    @Test
    @DisplayName("null-email не роняет guard")
    void nullEmailSafe() {
        assertThatCode(() -> service.assertNotBlocked(null)).doesNotThrowAnyException();
        assertThatCode(() -> service.recordFailure(null)).doesNotThrowAnyException();
    }
}
