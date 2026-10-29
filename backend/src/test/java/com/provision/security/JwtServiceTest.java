package com.provision.security;

import com.provision.config.JwtProperties;
import com.provision.entity.User;
import com.provision.entity.UserRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit-тесты JwtService по итогам аудита (plans/2026-10-29-full-audit.md):
 * подзадача 5 (iss/aud/typ + clock skew) и подзадача 6 (fail-fast на коротком
 * секрете вместо silent SHA-256 fallback).
 */
@DisplayName("JwtService: iss/aud/typ, clock skew, короткий секрет (аудит 5/6)")
class JwtServiceTest {

    private static final String SECRET = "test-secret-key-for-jwt-tokens-must-be-at-least-256-bits-long";
    private static final String ISSUER = "provision";
    private static final String AUDIENCE = "provision-api";

    private JwtService newService(String secret) {
        JwtProperties props = new JwtProperties();
        props.setSecret(secret);
        props.setAccessTokenExpiration(3600_000L);
        props.setIssuer(ISSUER);
        props.setAudience(AUDIENCE);
        return new JwtService(props);
    }

    private JwtService service() {
        return newService(SECRET);
    }

    private User user() {
        return User.builder().id(1L).email("user@example.com")
                .firstName("Test").lastName("User").role(UserRole.USER).build();
    }

    private SecretKey key(String secret) {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /** Разбор «в лоб» (без require*) — для инспекции claims в тестах. */
    private Claims parseRaw(String token, String secret) {
        return Jwts.parser().verifyWith(key(secret)).build()
                .parseSignedClaims(token).getPayload();
    }

    @Test
    @DisplayName("SUB-5: access-токен несёт iss, aud, typ=access и header typ=JWT")
    void tokenCarriesIssuerAudienceTyp() {
        String token = service().generateAccessToken(user());
        Claims claims = parseRaw(token, SECRET);

        assertThat(claims.getIssuer()).isEqualTo(ISSUER);
        assertThat(claims.getAudience()).contains(AUDIENCE);
        assertThat(claims.get("typ", String.class)).isEqualTo("access");
        assertThat(claims.getSubject()).isEqualTo("user@example.com");
        assertThat(claims.get("role", String.class)).isEqualTo("USER");

        String headerJson = new String(java.util.Base64.getUrlDecoder()
                .decode(token.split("\\.")[0]), StandardCharsets.UTF_8);
        assertThat(headerJson).contains("\"typ\":\"JWT\"");
    }

    @Test
    @DisplayName("SUB-5: isTokenValid — true для своего пользователя, false для чужого")
    void isTokenValidChecksSubject() {
        String token = service().generateAccessToken(user());
        assertThat(service().isTokenValid(token, user())).isTrue();

        User other = User.builder().id(2L).email("other@example.com")
                .firstName("O").lastName("T").role(UserRole.USER).build();
        assertThat(service().isTokenValid(token, other)).isFalse();
    }

    @Test
    @DisplayName("SUB-5: токен без issuer (подпись валидна) отклоняется")
    void tokenWithoutIssuerRejected() {
        String noIssuer = Jwts.builder()
                .subject("user@example.com")
                .claim("typ", "access")
                .audience().add(AUDIENCE).and()
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(key(SECRET))
                .compact();

        JwtService svc = service();
        assertThatThrownBy(() -> svc.extractUsername(noIssuer)).isInstanceOf(JwtException.class);
        assertThat(svc.isTokenValid(noIssuer, user())).isFalse();
    }

    @Test
    @DisplayName("SUB-5: токен с чужим audience отклоняется")
    void tokenWithWrongAudienceRejected() {
        String wrongAud = Jwts.builder()
                .subject("user@example.com")
                .claim("typ", "access")
                .issuer(ISSUER)
                .audience().add("some-other-service").and()
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(key(SECRET))
                .compact();

        JwtService svc = service();
        assertThatThrownBy(() -> svc.extractUsername(wrongAud)).isInstanceOf(JwtException.class);
        assertThat(svc.isTokenValid(wrongAud, user())).isFalse();
    }

    @Test
    @DisplayName("SUB-5: токен с typ != access не проходит isTokenValid")
    void tokenWithWrongTypRejected() {
        String wrongTyp = Jwts.builder()
                .subject("user@example.com")
                .claim("typ", "refresh")
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(key(SECRET))
                .compact();

        assertThat(service().isTokenValid(wrongTyp, user())).isFalse();
    }

    @Test
    @DisplayName("SUB-5: токен, подписанный другим ключом, отклоняется")
    void tokenWithOtherKeyRejected() {
        String foreign = Jwts.builder()
                .subject("user@example.com")
                .claim("typ", "access")
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(key("another-secret-key-at-least-32-bytes-long!!"))
                .compact();

        JwtService svc = service();
        assertThatThrownBy(() -> svc.extractUsername(foreign)).isInstanceOf(JwtException.class);
        assertThat(svc.isTokenValid(foreign, user())).isFalse();
    }

    @Test
    @DisplayName("SUB-5: просроченный токен отклоняется; в пределах skew 60c — принимается")
    void expirationAndClockSkew() {
        JwtService svc = service();

        String longExpired = Jwts.builder()
                .subject("user@example.com").claim("typ", "access")
                .issuer(ISSUER).audience().add(AUDIENCE).and()
                .expiration(new Date(System.currentTimeMillis() - 120_000))
                .signWith(key(SECRET)).compact();
        assertThatThrownBy(() -> svc.extractUsername(longExpired))
                .isInstanceOf(ExpiredJwtException.class);
        assertThat(svc.isTokenValid(longExpired, user())).isFalse();

        String expiredWithinSkew = Jwts.builder()
                .subject("user@example.com").claim("typ", "access")
                .issuer(ISSUER).audience().add(AUDIENCE).and()
                .expiration(new Date(System.currentTimeMillis() - 30_000))
                .signWith(key(SECRET)).compact();
        assertThat(svc.extractUsername(expiredWithinSkew)).isEqualTo("user@example.com");
    }

    @Test
    @DisplayName("SUB-6: короткий секрет — fail-fast IllegalStateException, без SHA-256 fallback")
    void shortSecretFailsFast() {
        JwtService svc = newService("short-secret");

        assertThatThrownBy(() -> svc.generateAccessToken(user()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at least 32 bytes");
    }

    @Test
    @DisplayName("SUB-6: пустой секрет — IllegalStateException с подсказкой про JWT_SECRET")
    void blankSecretFailsFast() {
        JwtService svc = newService("  ");

        assertThatThrownBy(() -> svc.generateAccessToken(user()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
    }
}
