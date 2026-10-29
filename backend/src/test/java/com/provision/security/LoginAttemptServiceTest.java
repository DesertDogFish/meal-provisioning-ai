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
 * plans/done/2026-10-29-full-audit.md): порог, блокировка, сброс по успеху,
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
    // ---------------------------------------------------------------------
    // AU-04 (внешний аудит 30.10.2026): потолок карты — guard не должен быть
    // вектором DoS. Ключ создаётся из произвольного email, а /api/v1/auth/**
    // открыт анонимно, поэтому без ограничения неаутентифицированный клиент
    // раздувал heap случайными email. Потолок в тестах уменьшен, чтобы проверить
    // эвакуацию без создания 50 000 записей.
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("AU-04: на потолке незаблокированные записи эвакуируются, новый ключ продолжает учитываться")
    void atCapacity_unlockedEvicted_newKeyStillTracked() {
        LoginAttemptService bounded = new LoginAttemptService(null, 20);
        for (int i = 0; i < 20; i++) {
            bounded.recordFailure("u" + i + "@example.com");   // по одной неудаче — никто не заблокирован
        }
        assertThat(bounded.trackedKeys()).isEqualTo(20);

        bounded.recordFailure("overflow@example.com");

        assertThat(bounded.trackedKeys()).isLessThanOrEqualTo(20);
        assertThat(bounded.evictedKeys()).isZero();            // место освободили, отказ не понадобился
        // новый ключ действительно учитывается: доводим его до блокировки
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS - 1; i++) {
            bounded.recordFailure("overflow@example.com");
        }
        assertThat(bounded.isBlocked("overflow@example.com")).isTrue();
    }

    @Test
    @DisplayName("AU-04: заблокированные записи не эвакуируются; новый ключ при полном потолке не учитывается")
    void atCapacity_lockedPreserved_newKeyDroppedFailOpen() {
        LoginAttemptService bounded = new LoginAttemptService(null, 10);
        for (int i = 0; i < 10; i++) {
            for (int a = 0; a < LoginAttemptService.MAX_ATTEMPTS; a++) {
                bounded.recordFailure("locked" + i + "@example.com");
            }
        }
        assertThat(bounded.trackedKeys()).isEqualTo(10);

        bounded.recordFailure("attacker@example.com");

        assertThat(bounded.trackedKeys()).isEqualTo(10);       // действующая защита не тронута
        assertThat(bounded.evictedKeys()).isEqualTo(1);
        assertThat(bounded.isBlocked("attacker@example.com")).isFalse();
        for (int i = 0; i < 10; i++) {
            assertThat(bounded.isBlocked("locked" + i + "@example.com")).isTrue();
        }
    }

    @Test
    @DisplayName("AU-04: потолок не мешает доводить до блокировки уже известный ключ")
    void atCapacity_existingKeyStillCounted() {
        LoginAttemptService bounded = new LoginAttemptService(null, 5);
        bounded.recordFailure("victim@example.com");
        for (int i = 0; i < 4; i++) {
            bounded.recordFailure("filler" + i + "@example.com");
        }
        assertThat(bounded.trackedKeys()).isEqualTo(5);

        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS - 1; i++) {
            bounded.recordFailure("victim@example.com");
        }
        assertThat(bounded.isBlocked("victim@example.com")).isTrue();
        assertThat(bounded.evictedKeys()).isZero();
    }

    @Test
    @DisplayName("AU-04: боевой потолок конечен и меньше MAX_ATTEMPTS не бывает")
    void productionCapIsBounded() {
        assertThat(LoginAttemptService.MAX_TRACKED_KEYS).isBetween(1_000, 500_000);
        assertThatThrownBy(() -> new LoginAttemptService(null, 2))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
