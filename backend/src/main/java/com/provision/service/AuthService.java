package com.provision.service;

import com.provision.config.JwtProperties;
import com.provision.dto.auth.*;
import com.provision.entity.RefreshToken;
import com.provision.entity.User;
import com.provision.entity.UserRole;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.exception.UnauthorizedException;
import com.provision.repository.RefreshTokenRepository;
import com.provision.repository.UserRepository;
import com.provision.security.JwtService;
import com.provision.security.LoginAttemptService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    /** Ключ HMAC для хэширования refresh-токенов (подзадача 3 аудита). */
    private final JwtProperties jwtProperties;
    /** Brute-force guard (подзадача 19 аудита): 5 неудач на email -> 429 на 15 минут. */
    private final LoginAttemptService loginAttemptService;
    /**
     * Метрики refresh-reuse (подзадача 4 аудита 02.11.2026). ObjectProvider —
     * сервис поднимается и в срезах без actuator (как LoginAttemptService).
     */
    private final ObjectProvider<MeterRegistry> meterRegistryProvider;

    /** Метка деривации отдельного HMAC-ключа для хэша refresh-токенов (подзадача 4.3). */
    static final String REFRESH_HASH_KEY_LABEL = "provision-refresh-hash";

    /** Имя счётчика предъявлений отозванного refresh-токена (признак кражи). */
    static final String METRIC_REFRESH_REUSE = "auth.refresh.reuse";

    /**
     * Фиктивный BCrypt-хэш для выравнивания времени ответа login при неизвестном email
     * (подзадача 8 аудита): значение не важно — результат matches() отбрасывается,
     * важно лишь, что BCrypt-проверка выполняется и в этой ветке тоже.
     */
    private static final String DUMMY_PASSWORD_HASH =
    // nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash
            "$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG";

    @Transactional
    public AuthResponseWithUser register(RegisterRequest request) {
        // Подзадача 4.4 аудита: /auth/register был без лимитов — теперь тот же
        // механизм AU-04 (ключ register:<email>): повторные регистрации занятого
        // email блокируются 429 после 5 конфликтов за окно. Массовая регистрация
        // случайными email — уровень IP-лимита nginx (BL-38), не этот ключ.
        String registerKey = LoginAttemptService.registerKey(request.email());
        loginAttemptService.assertNotBlocked(registerKey);
        if (userRepository.existsByEmail(request.email())) {
            loginAttemptService.recordFailure(registerKey);
            log.warn("Register rejected: email already registered ({})", request.email());
            throw new ConflictException("Email already registered: " + request.email());
        }
        loginAttemptService.recordSuccess(registerKey);

        User user = User.builder()
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .firstName(request.firstName())
                .lastName(request.lastName())
                .role(UserRole.USER)
                .build();

        user = userRepository.save(user);
        log.info("Registered new user: {}", user.getEmail());

        // Расширение контракта (P1, AUTH-01): регистрация сразу выдаёт пару токенов —
        // клиенту не нужен второй round-trip на /login. Тело содержит поля пользователя
        // (id/email/firstName/lastName/role) + accessToken/refreshToken/tokenType.
        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = generateRefreshToken();
        saveRefreshToken(user, refreshToken, LocalDateTime.now());
        return new AuthResponseWithUser(toUserResponse(user), accessToken, refreshToken);
    }

    /** AuthResponse + поля пользователя (обратная совместимость формы ответа). */
    public record AuthResponseWithUser(
            Long id, String email, String firstName, String lastName, String role,
            String accessToken, String refreshToken, String tokenType
    ) {
        AuthResponseWithUser(UserResponse u, String accessToken, String refreshToken) {
            this(u.id(), u.email(), u.firstName(), u.lastName(),
                    u.role() != null ? u.role().name() : null, accessToken, refreshToken, "Bearer");
        }
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        // FIX (подзадача 19 аудита): заблокированный email отклоняется 429 ДО обращения
        // к БД и BCrypt — brute-force не тратит ресурсы сервера.
        loginAttemptService.assertNotBlocked(request.email());

        // FIX (подзадача 8 аудита, user enumeration): раньше отсутствие пользователя
        // бросало исключение ДО BCrypt-проверки — ответ «user not found» приходил заметно
        // быстрее «wrong password», что позволяло enumerровать email по таймингу.
        // Теперь проверка пароля выполняется всегда (против dummy-хэша, если пользователя
        // нет), а сообщение об ошибке едино для обеих веток.
        User user = userRepository.findByEmail(request.email()).orElse(null);
        boolean passwordMatches = passwordEncoder.matches(
                request.password(),
                user != null ? user.getPasswordHash() : DUMMY_PASSWORD_HASH);

        if (user == null || !passwordMatches) {
            loginAttemptService.recordFailure(request.email());
            log.warn("Failed login attempt for email={} (userExists={})",
                    request.email(), user != null);
            throw new UnauthorizedException("Invalid email or password");
        }
        loginAttemptService.recordSuccess(request.email());

        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = generateRefreshToken();

        // Сохраняем refresh token (хэш)
        saveRefreshToken(user, refreshToken, LocalDateTime.now());

        log.info("User logged in: {}", user.getEmail());
        return new AuthResponse(accessToken, refreshToken);
    }

    /**
     * noRollbackFor (подзадача 4.1): отзыв семьи токенов при reuse-detection и
     * ленивая очистка истёкших ДОЛЖНЫ оставаться в БД, хотя метод и завершается
     * UnauthorizedException — иначе rollback отменял бы саму защиту (регресс,
     * пойманный AuthIntegrationTest AUTH-11). Все ветки с 401 меняют только
     * refresh_tokens (отзыв/удаление), частичного доменного состояния не оставляют.
     */
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public AuthResponse refreshTokens(RefreshTokenRequest request) {
        // Подзадача 4.4 аудита: глобальный счётчик провалов /auth/refresh
        // (ключ один на эндпоинт, потолок LoginAttemptService.REFRESH_MAX_ATTEMPTS).
        loginAttemptService.assertNotBlocked(LoginAttemptService.REFRESH_GLOBAL_KEY);

        LocalDateTime now = LocalDateTime.now();
        // Ленивая физическая очистка истёкших (подзадача 4.1): отозванные строки
        // остаются для reuse-detection, а просроченные — мусор, удаляем на месте.
        refreshTokenRepository.deleteExpiredTokens(now);

        String tokenHash = hashToken(request.refreshToken());
        RefreshToken storedToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElse(null);
        if (storedToken == null) {
            loginAttemptService.recordFailure(LoginAttemptService.REFRESH_GLOBAL_KEY,
                    LoginAttemptService.REFRESH_MAX_ATTEMPTS);
            log.warn("Refresh rejected: token not found");
            throw new UnauthorizedException("Invalid refresh token");
        }

        // ПОДЗАДАЧА 4.1 (OAuth Security BCP, refresh token replay): предъявлен УЖЕ
        // ОТОЗВАННЫЙ (ротированный) токен — вероятная кража. Отзываем ВСЮ семью
        // refresh-токенов пользователя, логируем, метрика, 401.
        if (storedToken.getRevokedAt() != null) {
            int revoked = refreshTokenRepository.revokeAllByUserId(storedToken.getUser().getId(), now);
            countRefreshReuse();
            log.warn("Refresh REUSE detected: userId={}, revokedAt={}, revoked {} active token(s) — "
                            + "possible token theft, whole family revoked",
                    storedToken.getUser().getId(), storedToken.getRevokedAt(), revoked);
            throw new UnauthorizedException("Invalid refresh token");
        }

        if (storedToken.getExpiresAt().isBefore(now)) {
            refreshTokenRepository.deleteByTokenHash(tokenHash);
            log.info("Refresh rejected: token expired for userId={}", storedToken.getUser().getId());
            throw new UnauthorizedException("Refresh token expired");
        }

        User user = storedToken.getUser();

        // Ротация: новый токен создаётся, старый помечается АТОМАРНО
        // (UPDATE ... WHERE revoked_at IS NULL берёт блокировку строки). При двух
        // параллельных refresh с одним UUID вторая транзакция получит updated=0 —
        // строго по BCP трактуем как reuse и отзываем семью (прежняя семантика
        // «race -> 401» сохранена, добавлен отзыв семьи).
        String newRefreshToken = generateRefreshToken();
        RefreshToken newStored = saveRefreshToken(user, newRefreshToken, now);
        int updated = refreshTokenRepository.revokeForRotation(tokenHash, newStored.getId(), now);
        if (updated == 0) {
            int revoked = refreshTokenRepository.revokeAllByUserId(user.getId(), now);
            countRefreshReuse();
            log.warn("Refresh race detected: token already rotated, userId={} — revoked {} active token(s)",
                    user.getId(), revoked);
            throw new UnauthorizedException("Invalid refresh token");
        }

        String newAccessToken = jwtService.generateAccessToken(user);
        log.info("Refresh tokens rotated for userId={}", user.getId());
        return new AuthResponse(newAccessToken, newRefreshToken);
    }

    private void countRefreshReuse() {
        MeterRegistry registry = meterRegistryProvider.getIfAvailable();
        if (registry != null) {
            registry.counter(METRIC_REFRESH_REUSE).increment();
        }
    }

    @Transactional
    public void logout(LogoutRequest request) {
        String tokenHash = hashToken(request.refreshToken());
        refreshTokenRepository.findByTokenHash(tokenHash)
                .ifPresent(refreshTokenRepository::delete);
        log.info("User logged out");
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        return toUserResponse(user);
    }

    /**
     * Сохранить refresh-токен. ПОДЗАДАЧА 4.2 аудита: TTL больше не хардкод
     * «7 дней» — берётся из jwt.refresh-token-expiration (JwtProperties,
     * application.yml), чтобы смена конфига реально меняла expires_at в БД.
     */
    private RefreshToken saveRefreshToken(User user, String refreshToken, LocalDateTime issuedAt) {
        String tokenHash = hashToken(refreshToken);
        RefreshToken token = RefreshToken.builder()
                .user(user)
                .tokenHash(tokenHash)
                .expiresAt(issuedAt.plus(Duration.ofMillis(jwtProperties.getRefreshTokenExpiration())))
                .build();
        return refreshTokenRepository.save(token);
    }

    private String generateRefreshToken() {
        return UUID.randomUUID().toString();
    }

    /**
     * Хэш refresh-токена для хранения в БД (колонка refresh_tokens.token_hash).
     *
     * FIX (подзадача 3 аудита): раньше — unsalted SHA-256, обратимый по радужным
     * таблицам при утечке БД → HMAC-SHA256.
     *
     * ПОДЗАДАЧА 4.3 аудита 02.11.2026 (key separation): ключ хэширования БОЛЬШЕ
     * не сам JWT_SECRET — он деривируется: derived = HMAC-SHA256(JWT_SECRET,
     * "provision-refresh-hash"), хэш = HMAC-SHA256(derived, token). Signing-ключ
     * access-токенов не переиспользуется напрямую в другой роли (утечка одного
     * применения не даёт материал другого; ср. NIST SP 800-108 — одна итерация
     * KDF в counter-mode с фиксированной меткой).
     * Следствие для деплоя: сохранённые ранее хэши (HMAC от «голого» секрета)
     * перестанут находиться — пользователи разово перелогинятся (прецедент —
     * переход SHA-256→HMAC; access-токены не затронуты).
     */
    private String hashToken(String token) {
        try {
            byte[] derivedKey = hmacSha256(
                    jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8),
                    REFRESH_HASH_KEY_LABEL.getBytes(StandardCharsets.UTF_8));
            byte[] hash = hmacSha256(derivedKey, token.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hexString.append(String.format("%02x", 0xff & b));
            }
            return hexString.toString();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cannot hash refresh token (HmacSHA256)", e);
        }
    }

    private static byte[] hmacSha256(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private UserResponse toUserResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getRole()
        );
    }
}
