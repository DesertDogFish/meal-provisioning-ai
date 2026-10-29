package com.provision.service;

import com.provision.config.JwtProperties;
import com.provision.dto.auth.AuthResponse;
import com.provision.dto.auth.LoginRequest;
import com.provision.dto.auth.RefreshTokenRequest;
import com.provision.dto.auth.RegisterRequest;
import com.provision.entity.RefreshToken;
import com.provision.entity.User;
import com.provision.entity.UserRole;
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
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit-тесты AuthService по итогам аудита (plans/2026-10-29-full-audit.md):
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

    private AuthService authService;

    @BeforeEach
    void setUp() {
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecret(SECRET);
        authService = new AuthService(userRepository, refreshTokenRepository,
                passwordEncoder, jwtService, jwtProperties, loginAttemptService);
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

    // ---------- подзадача 3: refresh-хэш — HMAC-SHA256, не голый SHA-256 ----------

    @Test
    @DisplayName("SUB-3: refresh-токен сохраняется как HMAC-SHA256(key=jwt.secret), не SHA-256")
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
        assertThat(storedHash).isEqualTo(hmacSha256Hex(SECRET, rawToken));
        assertThat(storedHash).isNotEqualTo(sha256Hex(rawToken)); // радужные таблицы SHA-256 больше не работают
    }

    // ---------- подзадача 4: race при параллельном refresh ----------

    /** Хэш, который AuthService вычислит для RAW_REFRESH (HMAC-SHA256 от jwt.secret). */
    private String storedHashOfRaw() throws Exception {
        return hmacSha256Hex(SECRET, RAW_REFRESH);
    }

    @Test
    @DisplayName("SUB-4: refresh удаляет старый токен АТОМАРНО до выдачи новой пары")
    void refresh_invalidatesOldTokenBeforeIssuingNew() throws Exception {
        User u = user("user@example.com");
        RefreshToken stored = RefreshToken.builder()
                .id(10L).user(u).tokenHash(storedHashOfRaw()).expiresAt(LocalDateTime.now().plusDays(1)).build();
        when(refreshTokenRepository.findByTokenHash(stored.getTokenHash())).thenReturn(Optional.of(stored));
        when(refreshTokenRepository.deleteByTokenHash(stored.getTokenHash())).thenReturn(1);
        when(jwtService.generateAccessToken(u)).thenReturn("new-access");

        authService.refreshTokens(new RefreshTokenRequest(RAW_REFRESH));

        InOrder order = inOrder(refreshTokenRepository);
        order.verify(refreshTokenRepository).deleteByTokenHash(stored.getTokenHash());
        order.verify(refreshTokenRepository).save(any(RefreshToken.class));
    }

    @Test
    @DisplayName("SUB-4: параллельный refresh (deleted=0) отклоняется 401, новая пара НЕ выдаётся")
    void refresh_raceSecondCallRejected() throws Exception {
        User u = user("user@example.com");
        RefreshToken stored = RefreshToken.builder()
                .id(10L).user(u).tokenHash(storedHashOfRaw()).expiresAt(LocalDateTime.now().plusDays(1)).build();
        when(refreshTokenRepository.findByTokenHash(stored.getTokenHash())).thenReturn(Optional.of(stored));
        // первая транзакция уже успела удалить токен — вторая видит 0 удалённых строк
        when(refreshTokenRepository.deleteByTokenHash(stored.getTokenHash())).thenReturn(0);

        assertThatThrownBy(() -> authService.refreshTokens(new RefreshTokenRequest(RAW_REFRESH)))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Invalid refresh token");

        verify(jwtService, never()).generateAccessToken(any());
        verify(refreshTokenRepository, never()).save(any());
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

    // ---------- хелперы ----------

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
