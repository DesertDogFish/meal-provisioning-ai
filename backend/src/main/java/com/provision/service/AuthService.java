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

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
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
     * Фиктивный BCrypt-хэш для выравнивания времени ответа login при неизвестном email
     * (подзадача 8 аудита): значение не важно — результат matches() отбрасывается,
     * важно лишь, что BCrypt-проверка выполняется и в этой ветке тоже.
     */
    private static final String DUMMY_PASSWORD_HASH =
            "$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG";

    @Transactional
    public AuthResponseWithUser register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ConflictException("Email already registered: " + request.email());
        }

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
        saveRefreshToken(user, refreshToken);
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
        saveRefreshToken(user, refreshToken);

        log.info("User logged in: {}", user.getEmail());
        return new AuthResponse(accessToken, refreshToken);
    }

    @Transactional
    public AuthResponse refreshTokens(RefreshTokenRequest request) {
        String tokenHash = hashToken(request.refreshToken());
        RefreshToken storedToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> {
                    log.warn("Refresh rejected: token not found");
                    return new UnauthorizedException("Invalid refresh token");
                });

        if (storedToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            refreshTokenRepository.deleteByTokenHash(tokenHash);
            log.info("Refresh rejected: token expired for userId={}", storedToken.getUser().getId());
            throw new UnauthorizedException("Refresh token expired");
        }

        User user = storedToken.getUser();

        // FIX (подзадача 4 аудита, race condition): старый токен инвалидируется АТОМАРНО
        // (bulk DELETE по уникальному token_hash берёт блокировку строки) ДО выдачи новой пары.
        // При двух параллельных refresh с одним UUID вторая транзакция получит deleted=0
        // и будет отклонена — два валидных токена из одного выдать невозможно.
        int deleted = refreshTokenRepository.deleteByTokenHash(tokenHash);
        if (deleted == 0) {
            log.warn("Refresh race detected: token already rotated/deleted, userId={}", user.getId());
            throw new UnauthorizedException("Invalid refresh token");
        }

        String newAccessToken = jwtService.generateAccessToken(user);
        String newRefreshToken = generateRefreshToken();
        saveRefreshToken(user, newRefreshToken);

        log.info("Refresh tokens rotated for userId={}", user.getId());
        return new AuthResponse(newAccessToken, newRefreshToken);
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

    private void saveRefreshToken(User user, String refreshToken) {
        String tokenHash = hashToken(refreshToken);
        RefreshToken token = RefreshToken.builder()
                .user(user)
                .tokenHash(tokenHash)
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build();
        refreshTokenRepository.save(token);
    }

    private String generateRefreshToken() {
        return UUID.randomUUID().toString();
    }

    /**
     * Хэш refresh-токена для хранения в БД (колонка refresh_tokens.token_hash).
     *
     * FIX (подзадача 3 аудита): раньше — unsalted SHA-256, обратимый по радужным
     * таблицам при утечке БД. Теперь — HMAC-SHA256 с ключом из JWT_SECRET (≥32 байт
     * гарантирует JwtProperties.validate()); без знания ключа хэш не подбирается.
     * Следствие для деплоя: сохранённые ранее SHA-256-хэши перестанут находиться —
     * пользователи разово перелогинятся (access-токены не затронуты).
     */
    private String hashToken(String token) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hexString.append(String.format("%02x", 0xff & b));
            }
            return hexString.toString();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cannot hash refresh token (HmacSHA256)", e);
        }
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
