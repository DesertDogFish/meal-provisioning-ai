package com.provision.security;

import com.provision.exception.TooManyRequestsException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Защита от brute-force на /auth/login (аудит 29.10.2026, подзадача 19,
 * plans/2026-10-29-full-audit.md).
 *
 * <p>Политика: {@value #MAX_ATTEMPTS} неудачных попыток подряд на один email
 * в пределах окна {@value #WINDOW_MINUTES} минут → блокировка на
 * {@value #LOCK_MINUTES} минут (429 + Retry-After). Успешный логин сбрасывает счётчик.</p>
 *
 * <p>Хранилище — in-memory (ConcurrentHashMap). В стеке НЕТ Redis, а деплой
 * одноинстансный (docker-compose: один backend), поэтому распределённый стор
 * не нужен; записи чистятся по TTL окна. Ограничение честно фиксируем: при
 * масштабировании на N инстансов счётчик станет per-node (ослабление в N раз) —
 * тогда потребуется общий стор (Redis/БД). Ключ — только email: блокировка по IP
 * за nginx-прокси без доверенного X-Forwarded-For всё равно неточна, а блокировать
 * весь офисный NAT одним неудачным паролем — хуже. Побочный эффект (лок жертвы
 * злоумышленником) ограничен коротким сроком блокировки.</p>
 */
@Service
@Slf4j
public class LoginAttemptService {

    static final int MAX_ATTEMPTS = 5;
    static final int WINDOW_MINUTES = 15;
    static final int LOCK_MINUTES = 15;

    private final Map<String, AttemptWindow> attempts = new ConcurrentHashMap<>();

    private static final class AttemptWindow {
        final AtomicInteger count = new AtomicInteger();
        volatile Instant windowStartedAt = Instant.now();
        volatile Instant lockedUntil = null;
    }

    /**
     * Проверка перед попыткой логина: если email заблокирован — 429 сразу,
     * без обращения к БД и BCrypt (экономия ресурсов и явный сигнал клиенту).
     */
    public void assertNotBlocked(String email) {
        AttemptWindow w = attempts.get(key(email));
        if (w == null) {
            return;
        }
        Instant lock = w.lockedUntil;
        if (lock != null) {
            if (Instant.now().isBefore(lock)) {
                long retryAfter = Duration.between(Instant.now(), lock).toSeconds() + 1;
                log.warn("Login blocked (brute-force guard): email={}, retryAfterSec={}", email, retryAfter);
                throw new TooManyRequestsException(
                        "Too many failed login attempts. Try again later.", retryAfter);
            }
            // блокировка истекла — начинаем чистое окно
            attempts.remove(key(email));
        }
    }

    /** Неудачная попытка: инкремент счётчика; при превышении — блокировка. */
    public void recordFailure(String email) {
        AttemptWindow w = attempts.computeIfAbsent(key(email), k -> new AttemptWindow());
        synchronized (w) {
            Instant now = Instant.now();
            if (Duration.between(w.windowStartedAt, now).toMinutes() >= WINDOW_MINUTES) {
                w.windowStartedAt = now;   // окно истекло — счёт с нуля
                w.count.set(0);
            }
            int total = w.count.incrementAndGet();
            if (total >= MAX_ATTEMPTS) {
                w.lockedUntil = now.plus(Duration.ofMinutes(LOCK_MINUTES));
                log.warn("Login locked for {} min after {} failed attempts: email={}",
                        LOCK_MINUTES, total, email);
            } else {
                log.info("Failed login attempt {} of {} for email={}", total, MAX_ATTEMPTS, email);
            }
        }
    }

    /** Успешный логин — счётчик чист. */
    public void recordSuccess(String email) {
        attempts.remove(key(email));
    }

    /** Диапазон блокировки для тестов/метрик. */
    public boolean isBlocked(String email) {
        AttemptWindow w = attempts.get(key(email));
        return w != null && w.lockedUntil != null && Instant.now().isBefore(w.lockedUntil);
    }

    private static String key(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
