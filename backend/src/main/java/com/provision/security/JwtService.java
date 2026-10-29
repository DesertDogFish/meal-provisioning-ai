package com.provision.security;

import com.provision.config.JwtProperties;
import com.provision.entity.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Выпуск и разбор access-токенов (HS256).
 *
 * FIX (аудит 29.10.2026, plans/2026-10-29-full-audit.md):
 * - подзадача 5: каждый токен несёт iss/aud/typ=access и header typ=JWT; парсер
 *   требует совпадения issuer/audience и допускает clock skew 60 c;
 * - подзадача 6: убран silent-fallback «SHA-256 для короткого секрета» — короткий
 *   ключ теперь fail-fast (JwtProperties.validate() на старте + явная проверка здесь
 *   для конструирования в обход Spring, например в тестах).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JwtService {

    /** Claim-тип токена: refresh-токены — непрозрачные UUID, JWT у нас только access. */
    public static final String TYP_CLAIM = "typ";
    public static final String TYP_ACCESS = "access";

    /** Допустимый перекос часов между сервисами (сек). */
    private static final long CLOCK_SKEW_SECONDS = 60;

    private final JwtProperties jwtProperties;

    public String generateAccessToken(User user) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", user.getRole().name());
        claims.put(TYP_CLAIM, TYP_ACCESS);
        return createToken(claims, user.getEmail(), jwtProperties.getAccessTokenExpiration());
    }

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    /**
     * Токен валиден, если парсер принял подпись/exp/iss/aud (см. extractAllClaims),
     * subject совпадает с email пользователя и typ == access. Ошибки разбора
     * конвертируются в false — решение об отказе принимает фильтр (логирует причину).
     */
    public boolean isTokenValid(String token, User user) {
        try {
            Claims claims = extractAllClaims(token);
            boolean valid = user.getEmail().equals(claims.getSubject())
                    && TYP_ACCESS.equals(claims.get(TYP_CLAIM, String.class));
            if (!valid) {
                log.warn("JWT rejected: subject/typ mismatch (sub={}, typ={})",
                        claims.getSubject(), claims.get(TYP_CLAIM));
            }
            return valid;
        } catch (JwtException | IllegalArgumentException e) {
            log.warn("JWT rejected on validation: {}", e.getMessage());
            return false;
        }
    }

    private <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                // Подзадача 5 (аудит): iss/aud обязательны, exp проверяется парсером
                // с допуском на перекос часов.
                .requireIssuer(jwtProperties.getIssuer())
                .requireAudience(jwtProperties.getAudience())
                .clockSkewSeconds(CLOCK_SKEW_SECONDS)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private String createToken(Map<String, Object> claims, String subject, long expiration) {
        return Jwts.builder()
                .header().type("JWT").and()
                .claims(claims)
                .subject(subject)
                .issuer(jwtProperties.getIssuer())
                .audience().add(jwtProperties.getAudience()).and()
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey())
                .compact();
    }

    private SecretKey getSigningKey() {
        String secret = jwtProperties.getSecret();
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "jwt.secret is not configured. Set JWT_SECRET env var (see .env.example).");
        }
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        // FIX (подзадача 6 аудита): прежний fallback «короче 32 байт -> SHA-256(secret)»
        // молча подписывал токены выводимым ключом (SHA-256 от короткой фразы подбирается
        // по словарю). Теперь — fail-fast: в Spring-контексте короткий секрет не переживёт
        // JwtProperties.validate(), а здесь ловится конструирование в обход валидации.
        if (keyBytes.length < 32) {
            throw new IllegalStateException(
                    "JWT secret is too short (" + keyBytes.length + " bytes): at least 32 bytes "
                    + "are required for HS256. Generate one with: openssl rand -base64 48");
        }
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
