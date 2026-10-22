package com.provision.config;

import com.provision.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    /**
     * Разрешённые origins для прямых запросов с фронтенда (например, vite dev-сервер
     * на http://localhost:5173 ходит напрямую на http://localhost:8080).
     * В docker-сценарии фронт идёт через nginx same-origin и CORS не нужен.
     * Переопределяется через CORS_ALLOWED_ORIGINS (список через запятую).
     */
    @Value("${cors.allowed-origins:http://localhost:5173,http://localhost:3000}")
    private String corsAllowedOrigins;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                // JWT stateless API: при отсутствии/невалидности токена отдаём 401 Unauthorized,
                // а не дефолтный 403 Forbidden (Spring Security без authenticationEntryPoint
                // трактует анонимный запрос как "аутентифицирован, но не авторизован" -> 403).
                // Это контрактное ожидание всех интеграционных тестов (PRICES-01 и др.).
                // ВАЖНО: различаем anonymous (нет токена -> 401) и authenticated-but-wrong-role
                // (токен есть, прав не хватает -> 403, ср. SEC-01/SEC-05 в SecurityIntegrationTest).
                .exceptionHandling(ex -> ex.authenticationEntryPoint(
                        new org.springframework.security.web.authentication.HttpStatusEntryPoint(
                                org.springframework.http.HttpStatus.UNAUTHORIZED)))
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/auth/**").permitAll()
                        .requestMatchers("/api/v1/meta").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // P0-3: GET /api/v1/prices** — чтение цен для ВСЕХ аутентифицированных
                        // (страницы походов обычного USER). Эндпоинт лежит вне /api/v1/admin/**,
                        // поэтому его открывает любое из правил ниже + anyRequest().authenticated();
                        // явное правило добавлено для читаемости и защиты от будущих правок.
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/prices", "/api/v1/prices/**").authenticated()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.stream(corsAllowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(false); // токен в Authorization-заголовке, cookie не используем
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
