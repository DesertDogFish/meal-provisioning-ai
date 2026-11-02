package com.provision.service;

import com.provision.config.JwtProperties;
import com.provision.dto.auth.AuthResponse;
import com.provision.dto.auth.LoginRequest;
import com.provision.dto.auth.RefreshTokenRequest;
import com.provision.dto.auth.RegisterRequest;
import com.provision.entity.RefreshToken;
import com.provision.entity.User;
import com.provision.entity.UserRole;
import com.provision.exception.ConflictException;
import com.provision.exception.UnauthorizedException;
import com.provision.repository.RefreshTokenRepository;
import com.provision.repository.UserRepository;
import com.provision.exception.TooManyRequestsException;
import com.provision.security.JwtService;
import com.provision.security.LoginAttemptService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit-тесты AuthService по итогам аудита (plans/done/2026-10-29-full-audit.md):
 * подзадача 2 (сид/регистрация только через BCrypt), 3 (HMAC-хэш refresh-токенов),
 * 4 (атомарная ротация refresh — race), 8 (единый ответ login без.enumeration).
 *
 * <p>Репозитории и JwtService — моки (слой сервиса, R2); PasswordEncoder — реальный
 * BCrypt, чтобы проверять префикс хэша, а не факт вызова.</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService: регистрация/логин/ротация refresh-токенов (аудит 1-10)")
class AuthServiceTest {

    private static final String SECRET = "test-secret-key-for-jwt-tokens-must-be-at-least-256-bits-long";
    private static final String RAW_REFRESH = "raw-token";

    @Mock
    private UserRepository userRepository;
    @Mock
    private RefreshTokenRepository refreshTokenRepository;
    @Mock
    private JwtService jwtService;

    /** Spy поверх реального BCrypt: можно и verify() вызывать, и хэш настоящий ($2a$). */
    @Spy
    private PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private final LoginAttemptService loginAttemptService = new LoginAttemptService();

    @Mock
    @SuppressWarnings("rawtypes")
    private ObjectProvider meterRegistryProvider;

    private JwtProperties jwtProperties;
    private AuthService authService;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        jwtProperties = new JwtProperties();
        jwtProperties.setSecret(SECRET);
        jwtProperties.setRefreshTokenExpiration(7L * 24 * 3600 * 1000); // 7 дней, как в application.yml
        lenient().when(meterRegistryProvider.getIfAvailable()).thenReturn(null);
        authService = new AuthService(userRepository, refreshTokenRepository,
                passwordEncoder, jwtService, jwtProperties, loginAttemptService,
                meterRegistryProvider);
    }

    private User user(String email) {
        return User.builder()
                .id(1L)
                .email(email)
                .passwordHash(passwordEncoder.encode("password123"))
                .firstName("Test")
                .lastName("User")
                .role(UserRole.USER)
                .build();
    }

    // ---------- подзадача 2: пароли хранятся только как BCrypt ----------

    @Test
    @DisplayName("SUB-2: register сохраняет BCrypt-хэш ($2a$), а не plaintext")
    void register_storesBcryptHash() {
        when(userRepository.existsByEmail("new@example.com")).thenReturn(false);
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(jwtService.generateAccessToken(any(User.class))).thenReturn("access-token");

        authService.register(new RegisterRequest("new@example.com", "password123", "John", "Doe"));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        String hash = captor.getValue().getPasswordHash();
        assertThat(hash).startsWith("$2a$");
        assertThat(passwordEncoder.matches("password123", hash)).isTrue();
        assertThat(hash).doesNotContain("password123");
    }

    // ---------- подзадачи 3 + 4.3: refresh-хэш — HMAC-SHA256 от ПРОИЗВОДНОГО ключа ----------

    @Test
    @DisplayName("SUB-3/4.3: refresh-токен сохраняется как HMAC-SHA256 от производного ключа (не от «голого» JWT_SECRET и не SHA-256)")
    void login_storesHmacRefreshHash() throws Exception {
        User u = user("user@example.com");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(u));
        when(jwtService.generateAccessToken(u)).thenReturn("access-token");

        AuthResponse response = authService.login(new LoginRequest("user@example.com", "password123"));

        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(captor.capture());
        String storedHash = captor.getValue().getTokenHash();
        String rawToken = response.refreshToken();

        assertThat(storedHash).hasSize(64).matches("[0-9a-f]{64}");
        // подзадача 4.3 (key separation): ключ — HMAC(JWT_SECRET, "provision-refresh-hash")
        assertThat(storedHash).isEqualTo(derivedHashHex(rawToken));
        assertThat(storedHash).isNotEqualTo(hmacSha256Hex(SECRET, rawToken)); // signing-ключ напрямую не используется
        assertThat(storedHash).isNotEqualTo(sha256Hex(rawToken)); // радужные таблицы SHA-256 больше не работают
    }

    // ---------- подзадача 4: race при параллельном refresh ----------

    /** Хэш, который AuthService вычислит для RAW_REFRESH (HMAC от производного ключа). */
    private String storedHashOfRaw() throws Exception {
        return derivedHashHex(RAW_REFRESH);
    }

    @Test
    @DisplayName("SUB-4: refresh помечает старый токен отозванным АТОМАРНО (revokeForRotation), новая пара выдаётся")
    void refresh_invalidatesOldTokenBeforeIssuingNew() throws Exception {
        User u = user("user@example.com");
        RefreshToken stored = RefreshToken.builder()
                .id(10L).user(u).tokenHash(storedHashOfRaw()).expiresAt(LocalDateTime.now().plusDays(1)).build();
        when(refreshTokenRepository.findByTokenHash(stored.getTokenHash())).thenReturn(Optional.of(stored));
        when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(inv -> {
            RefreshToken t = inv.getArgument(0);
            t.setId(99L);
            return t;
        });
        when(refreshTokenRepository.revokeForRotation(eq(stored.getTokenHash()), eq(99L), any(LocalDateTime.class)))
                .thenReturn(1);
        when(jwtService.generateAccessToken(u)).thenReturn("new-access");

        AuthResponse response = authService.refreshTokens(new RefreshTokenRequest(RAW_REFRESH));

        assertThat(response.refreshToken()).isNotBlank();
        InOrder order = inOrder(refreshTokenRepository);
        order.verify(refreshTokenRepository).save(any(RefreshToken.class));
        order.verify(refreshTokenRepository).revokeForRotation(eq(stored.getTokenHash()), eq(99L), any(LocalDateTime.class));
        // старый токен физически НЕ удаляется — остаётся для reuse-detection
        verify(refreshTokenRepository, never()).deleteByTokenHash(stored.getTokenHash());
    }

    @Test
    @DisplayName("SUB-4: параллельный refresh (updated=0) отклоняется 401 и отзывает ВСЮ семью токенов")
    void refresh_raceSecondCallRejected() throws Exception {
        User u = user("user@example.com");
        RefreshToken stored = RefreshToken.builder()
                .id(10L).user(u).tokenHash(storedHashOfRaw()).expiresAt(LocalDateTime.now().plusDays(1)).build();
        when(refreshTokenRepository.findByTokenHash(stored.getTokenHash())).thenReturn(Optional.of(stored));
        when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(inv -> {
            RefreshToken t = inv.getArgument(0);
            t.setId(99L);
            return t;
        });
        // первая транзакция уже успела отозвать токен — вторая видит 0 обновлённых строк
        when(refreshTokenRepository.revokeForRotation(eq(stored.getTokenHash()), eq(99L), any(LocalDateTime.class)))
                .thenReturn(0);

        assertThatThrownBy(() -> authService.refreshTokens(new RefreshTokenRequest(RAW_REFRESH)))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Invalid refresh token");

        verify(jwtService, never()).generateAccessToken(any());
        verify(refreshTokenRepository).revokeAllByUserId(eq(1L), any(LocalDateTime.class));
    }

    @Test
    @DisplayName("SUB-4: просроченный refresh-токен удаляется и отклоняется")
    void refresh_expiredTokenRejectedAndDeleted() throws Exception {
        User u = user("user@example.com");
        RefreshToken stored = RefreshToken.builder()
                .id(10L).user(u).tokenHash(storedHashOfRaw()).expiresAt(LocalDateTime.now().minusMinutes(1)).build();
        when(refreshTokenRepository.findByTokenHash(stored.getTokenHash())).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> authService.refreshTokens(new RefreshTokenRequest(RAW_REFRESH)))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Refresh token expired");

        verify(refreshTokenRepository).deleteByTokenHash(stored.getTokenHash());
        verify(refreshTokenRepository, never()).save(any());
    }

    // ---------- подзадача 19: brute-force guard ----------

    @Test
    @DisplayName("SUB-19: заблокированный email — 429 до обращения к БД")
    void login_blockedEmail_rejectedBeforeDb() {
        for (int i = 0; i < 5; i++) {
            loginAttemptService.recordFailure("victim@example.com");
        }

        assertThatThrownBy(() -> authService.login(new LoginRequest("victim@example.com", "any")))
                .isInstanceOf(TooManyRequestsException.class);

        verifyNoInteractions(userRepository);
        verify(jwtService, never()).generateAccessToken(any());
    }

    @Test
    @DisplayName("SUB-19: пять неудач подряд блокируют email; успех до блокировки сбрасывает счётчик")
    void login_failuresAccumulate_successResets() {
        User u = user("user@example.com");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(u));
        when(jwtService.generateAccessToken(u)).thenReturn("access-token");

        // 4 неудачи (не блокирует) + успех → счётчик сброшен
        for (int i = 0; i < 4; i++) {
            assertThatThrownBy(() -> authService.login(new LoginRequest("user@example.com", "wrong")))
                    .isInstanceOf(UnauthorizedException.class);
        }
        authService.login(new LoginRequest("user@example.com", "password123"));
        assertThat(loginAttemptService.isBlocked("user@example.com")).isFalse();

        // ещё 5 неудач → блокировка
        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> authService.login(new LoginRequest("user@example.com", "wrong")))
                    .isInstanceOf(UnauthorizedException.class);
        }
        assertThat(loginAttemptService.isBlocked("user@example.com")).isTrue();
        assertThatThrownBy(() -> authService.login(new LoginRequest("user@example.com", "password123")))
                .isInstanceOf(TooManyRequestsException.class);
    }

    // ---------- подзадача 8: user enumeration через login ----------

    @Test
    @DisplayName("SUB-8: неизвестный email — то же сообщение и BCrypt-проверка (dummy-хэш)")
    void login_unknownEmail_sameMessage_andPasswordStillChecked() {
        when(userRepository.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("ghost@example.com", "whatever")))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Invalid email or password");

        // ключевое: matches() вызван даже без пользователя — тайминг не отличается
        verify(passwordEncoder).matches(anyString(), anyString());
        verify(jwtService, never()).generateAccessToken(any());
    }

    @Test
    @DisplayName("SUB-8: неверный пароль существующего пользователя — идентичное сообщение")
    void login_wrongPassword_sameMessage() {
        User u = user("user@example.com");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> authService.login(new LoginRequest("user@example.com", "wrong-password")))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Invalid email or password");
    }

    @Test
    @DisplayName("login с верными учётными данными выдаёт пару токенов и сохраняет refresh")
    void login_success_issuesTokens() {
        User u = user("user@example.com");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(u));
        when(jwtService.generateAccessToken(u)).thenReturn("access-token");

        AuthResponse response = authService.login(new LoginRequest("user@example.com", "password123"));

        assertThat(response.accessToken()).isEqualTo("access-token");
        assertThat(response.refreshToken()).isNotBlank();
        verify(refreshTokenRepository).save(any(RefreshToken.class));
    }

    @Test
    @DisplayName("logout удаляет refresh-токен по хэшу")
    void logout_deletesToken() throws Exception {
        User u = user("user@example.com");
        RefreshToken stored = RefreshToken.builder()
                .id(10L).user(u).tokenHash(storedHashOfRaw()).expiresAt(LocalDateTime.now().plusDays(1)).build();
        when(refreshTokenRepository.findByTokenHash(stored.getTokenHash())).thenReturn(Optional.of(stored));

        authService.logout(new com.provision.dto.auth.LogoutRequest(RAW_REFRESH));

        verify(refreshTokenRepository).delete(stored);
    }

    // ---------- подзадача 4.1: refresh-reuse detection (OAuth Security BCP) ----------

    @Test
    @DisplayName("SUB-4.1: предъявление ОТОЗВАННОГО токена — reuse: семья отозвана, метрика, 401, новая пара НЕ выдаётся")
    void refresh_reuseDetection_revokesWholeFamily() throws Exception {
        User u = user("user@example.com");
        RefreshToken revoked = RefreshToken.builder()
                .id(10L).user(u).tokenHash(storedHashOfRaw())
                .expiresAt(LocalDateTime.now().plusDays(1))
                .revokedAt(LocalDateTime.now().minusMinutes(5))  // уже ротирован
                .replacedById(11L)
                .build();
        when(refreshTokenRepository.findByTokenHash(revoked.getTokenHash())).thenReturn(Optional.of(revoked));
        when(refreshTokenRepository.revokeAllByUserId(eq(1L), any(LocalDateTime.class))).thenReturn(2);

        assertThatThrownBy(() -> authService.refreshTokens(new RefreshTokenRequest(RAW_REFRESH)))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Invalid refresh token");

        verify(refreshTokenRepository).revokeAllByUserId(eq(1L), any(LocalDateTime.class));
        verify(jwtService, never()).generateAccessToken(any());
        verify(refreshTokenRepository, never()).save(any());
    }

    // ---------- подзадача 4.2: TTL refresh-токена из конфигурации ----------

    @Test
    @DisplayName("SUB-4.2: expires_at = now + jwt.refresh-token-expiration (не хардкод 7 дней)")
    void saveRefreshToken_ttlFromConfig() {
        jwtProperties.setRefreshTokenExpiration(3600_000L); // 1 час
        User u = user("user@example.com");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(u));
        when(jwtService.generateAccessToken(u)).thenReturn("access-token");

        LocalDateTime before = LocalDateTime.now();
        authService.login(new LoginRequest("user@example.com", "password123"));

        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(captor.capture());
        LocalDateTime expiresAt = captor.getValue().getExpiresAt();
        assertThat(expiresAt).isBetween(
                before.plusMinutes(59), LocalDateTime.now().plusMinutes(61));
    }

    // ---------- подзадача 4.4: rate-limit register и refresh ----------

    @Test
    @DisplayName("SUB-4.4: 5 конфликтов регистрации одного email → 429 без обращения к БД")
    void register_repeatedConflicts_blockedWith429() {
        when(userRepository.existsByEmail("taken@example.com")).thenReturn(true);

        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> authService.register(
                    new RegisterRequest("taken@example.com", "password123", "A", "B")))
                    .isInstanceOf(ConflictException.class);
        }
        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("taken@example.com", "password123", "A", "B")))
                .isInstanceOf(TooManyRequestsException.class);

        // 6-й вызов отклонён ДО БД: existsByEmail вызван ровно 5 раз
        verify(userRepository, times(5)).existsByEmail("taken@example.com");
    }

    @Test
    @DisplayName("SUB-4.4: провалы /auth/refresh копятся в глобальный счётчик → 429")
    void refresh_globalFailureCounter_blocksWith429() {
        when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        for (int i = 0; i < LoginAttemptService.REFRESH_MAX_ATTEMPTS; i++) {
            final String bogus = "bogus-" + i;
            assertThatThrownBy(() -> authService.refreshTokens(new RefreshTokenRequest(bogus)))
                    .isInstanceOf(UnauthorizedException.class);
        }
        assertThatThrownBy(() -> authService.refreshTokens(new RefreshTokenRequest("bogus-final")))
                .isInstanceOf(TooManyRequestsException.class);

        // заблокированный эндпоинт не ходит в БД
        verify(refreshTokenRepository, times(LoginAttemptService.REFRESH_MAX_ATTEMPTS))
                .findByTokenHash(anyString());
    }

    // ---------- хелперы ----------

    /** HMAC-SHA256 от производного ключа (подзадача 4.3): derived = HMAC(SECRET, label). */
    private static String derivedHashHex(String token) throws Exception {
        byte[] derived = hmacSha256Bytes(SECRET.getBytes(StandardCharsets.UTF_8),
                AuthService.REFRESH_HASH_KEY_LABEL.getBytes(StandardCharsets.UTF_8));
        return toHex(hmacSha256Bytes(derived, token.getBytes(StandardCharsets.UTF_8)));
    }

    private static byte[] hmacSha256Bytes(byte[] key, byte[] data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private static String hmacSha256Hex(String key, String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return toHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static String sha256Hex(String value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return toHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", 0xff & b));
        }
        return sb.toString();
    }
}
