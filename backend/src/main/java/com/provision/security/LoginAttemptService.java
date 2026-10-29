package com.provision.security;

import com.provision.exception.TooManyRequestsException;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Защита от brute-force на /auth/login (аудит 29.10.2026, подзадача 19,
 * plans/done/2026-10-29-full-audit.md).
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
 *
 * <p><b>Потолок памяти (внешний аудит 30.10.2026, AU-04).</b> Ключ создаётся из
 * произвольного email, а {@code /api/v1/auth/**} открыт анонимно
 * ({@code SecurityConfig}: permitAll), поэтому неаутентифицированный клиент мог
 * раздуть карту до исчерпания heap: запись на каждый новый email, а удаление
 * происходило только при повторном обращении <i>того же</i> ключа после истечения
 * блокировки — случайные email не возвращаются никогда. Теперь карта ограничена
 * {@value #MAX_TRACKED_KEYS} ключами, а при достижении потолка выполняется
 * каскадная эвакуация: сначала записи с истёкшим окном/блокировкой, затем
 * незаблокированные (у них нет активной защиты, которую можно потерять).
 * Заблокированные ключи не эвакуируются НИКОГДА — действующая защита важнее учёта
 * новых попыток. Если после эвакуации место не освободилось, новый ключ не
 * создаётся (fail-open для <i>одной</i> попытки с новым email) и растёт счётчик
 * {@code login_attempts_evicted} — по нему в Prometheus видна сама попытка атаки.</p>
 */
@Service
@Slf4j
public class LoginAttemptService {

    static final int MAX_ATTEMPTS = 5;
    static final int WINDOW_MINUTES = 15;
    static final int LOCK_MINUTES = 15;

    /**
     * Потолок числа отслеживаемых email (AU-04). 50 000 ключей × ~200 байт ≈ 10 МБ —
     * заметно меньше heap (700 МБ при {@code mem_limit: 1g}) и заведомо больше числа
     * реальных пользователей, поэтому в штатном режиме эвакуация не срабатывает вообще.
     */
    static final int MAX_TRACKED_KEYS = 50_000;

    private final Map<String, AttemptWindow> attempts = new ConcurrentHashMap<>();

    /**
     * Действующий потолок. Поле (а не константа) — чтобы тест мог проверить эвакуацию
     * на маленьком пределе, не создавая 50 000 записей; в проде всегда
     * {@value #MAX_TRACKED_KEYS}.
     */
    private final int maxTrackedKeys;

    /** Сколько раз ключ НЕ был создан из-за потолка (индикатор атаки; виден в метриках). */
    private final AtomicLong evictedKeys = new AtomicLong();

    /** Сколько записей удалено эвакуацией (диагностика, без алертов). */
    private final AtomicLong sweptKeys = new AtomicLong();

    /**
     * Основной конструктор: регистрирует gauge'и, если в контексте есть MeterRegistry.
     * {@link ObjectProvider} — чтобы сервис поднимался и в срезах без actuator.
     */
    @Autowired
    public LoginAttemptService(ObjectProvider<MeterRegistry> meterRegistryProvider) {
        this(meterRegistryProvider, MAX_TRACKED_KEYS);
    }

    /** Конструктор для unit-тестов: без MeterRegistry (метрики просто не регистрируются). */
    public LoginAttemptService() {
        this(null, MAX_TRACKED_KEYS);
    }

    /**
     * Тестовый конструктор: потолок меньше боевого, чтобы проверить эвакуацию
     * за вменяемое время. Package-private — наружу не часть контракта.
     */
    LoginAttemptService(ObjectProvider<MeterRegistry> meterRegistryProvider, int maxTrackedKeys) {
        if (maxTrackedKeys < MAX_ATTEMPTS) {
            throw new IllegalArgumentException(
                    "maxTrackedKeys must be >= MAX_ATTEMPTS (" + MAX_ATTEMPTS + "), got " + maxTrackedKeys);
        }
        this.maxTrackedKeys = maxTrackedKeys;
        MeterRegistry registry = meterRegistryProvider == null ? null : meterRegistryProvider.getIfAvailable();
        if (registry != null) {
            // R10/подзадача 18 аудита: рост карты и число отказов должны быть видны в Prometheus.
            registry.gaugeMapSize("login_attempts_tracked", Tags.empty(), attempts);
            registry.gauge("login_attempts_evicted", Tags.empty(), evictedKeys);
            registry.gauge("login_attempts_swept", Tags.empty(), sweptKeys);
        }
    }

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

    /**
     * Неудачная попытка: инкремент счётчика; при превышении — блокировка.
     *
     * <p>Существующий ключ обновляется всегда (его защита уже оплачена памятью);
     * потолок применяется только к созданию НОВОГО ключа —
     * см. {@link #newWindow(String)} (AU-04).</p>
     */
    public void recordFailure(String email) {
        String k = key(email);
        AttemptWindow w = attempts.get(k);
        if (w == null) {
            w = newWindow(k);
            if (w == null) {
                // Потолок не отпустил место: эту попытку не учитываем. Логируем WARN —
                // штатно ветка недостижима, её срабатывание и есть признак атаки.
                evictedKeys.incrementAndGet();
                log.warn("Login attempt NOT tracked (brute-force guard is full, {} keys): "
                        + "email hash={}", attempts.size(), Integer.toHexString(k.hashCode()));
                return;
            }
        }
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

    /**
     * Создать окно для нового ключа, не превысив потолок (AU-04).
     *
     * @return новое окно либо {@code null}, если место освободить не удалось
     */
    private AttemptWindow newWindow(String k) {
        if (attempts.size() < maxTrackedKeys) {
            return attempts.computeIfAbsent(k, x -> new AttemptWindow());
        }
        sweepExpired();
        if (attempts.size() >= maxTrackedKeys) {
            evictUnlocked();
        }
        if (attempts.size() >= maxTrackedKeys) {
            return null;
        }
        return attempts.computeIfAbsent(k, x -> new AttemptWindow());
    }

    /**
     * Удалить записи, у которых истекло и окно счёта, и блокировка: они больше ни на что
     * не влияют (следующая попытка всё равно начала бы чистое окно).
     */
    void sweepExpired() {
        Instant now = Instant.now();
        long removed = 0;
        Iterator<Map.Entry<String, AttemptWindow>> it = attempts.entrySet().iterator();
        while (it.hasNext()) {
            AttemptWindow w = it.next().getValue();
            synchronized (w) {
                boolean lockGone = w.lockedUntil == null || !now.isBefore(w.lockedUntil);
                boolean windowGone = Duration.between(w.windowStartedAt, now).toMinutes() >= WINDOW_MINUTES;
                if (lockGone && windowGone) {
                    it.remove();
                    removed++;
                }
            }
        }
        if (removed > 0) {
            sweptKeys.addAndGet(removed);
            log.info("Brute-force guard sweep: removed {} expired entries, {} tracked",
                    removed, attempts.size());
        }
    }

    /**
     * Освободить место, жертвуя НЕзаблокированными записями: у них нет активной защиты,
     * которую можно потерять, — только счётчик попыток. Заблокированные ключи не трогаем.
     */
    void evictUnlocked() {
        Instant now = Instant.now();
        long removed = 0;
        Iterator<Map.Entry<String, AttemptWindow>> it = attempts.entrySet().iterator();
        while (it.hasNext() && attempts.size() > maxTrackedKeys / 2) {
            AttemptWindow w = it.next().getValue();
            synchronized (w) {
                boolean locked = w.lockedUntil != null && now.isBefore(w.lockedUntil);
                if (!locked) {
                    it.remove();
                    removed++;
                }
            }
        }
        if (removed > 0) {
            sweptKeys.addAndGet(removed);
            log.warn("Brute-force guard at capacity ({} keys): evicted {} unlocked entries "
                    + "to make room; locked entries preserved", maxTrackedKeys, removed);
        }
    }

    /** Сколько ключей отслеживается сейчас (метрики/тесты). */
    public int trackedKeys() {
        return attempts.size();
    }

    /**
     * Сколько раз новый ключ НЕ был создан из-за потолка (AU-04). Штатно всегда 0;
     * рост — признак попытки раздуть guard случайными email.
     */
    public long evictedKeys() {
        return evictedKeys.get();
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
