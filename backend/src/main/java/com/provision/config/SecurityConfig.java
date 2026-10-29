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

    /**
     * Публичность swagger/openapi (аудит 29.10.2026, подзадача 10).
     * Тот же флаг, что включает/выключает сами эндпоинты springdoc; в prod-деплое
     * задаётся SPRINGDOC_API_DOCS_ENABLED=false — тогда документация уходит за
     * роль ADMIN (и springdoc её больше не отдаёт). Дефолт true — dev-профиль compose.
     */
    @Value("${springdoc.api-docs.enabled:true}")
    private boolean apiDocsEnabled;

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
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers("/api/v1/auth/**").permitAll()
                            .requestMatchers("/api/v1/meta").permitAll()
                            // Аудит 29.10.2026, подзадача 18: health публичен (liveness/readiness
                            // для оркестраторов), прочие actuator-эндпоинты — только ADMIN.
                            .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                            .requestMatchers("/actuator/**").hasRole("ADMIN");
                    // Аудит 29.10.2026, подзадача 10: swagger открыт анонимно только когда
                    // springdoc включён (dev); в prod (SPRINGDOC_API_DOCS_ENABLED=false) —
                    // только ADMIN. Заодно добавлен /api-docs/**: springdoc.api-docs.path
                    // в application.yml переносит openapi с /v3/api-docs на /api-docs,
                    // а whitelist этого пути не содержал (swagger-ui падал с 401).
                    if (apiDocsEnabled) {
                        auth.requestMatchers("/v3/api-docs/**", "/api-docs/**",
                                "/swagger-ui/**", "/swagger-ui.html").permitAll();
                    } else {
                        auth.requestMatchers("/v3/api-docs/**", "/api-docs/**",
                                "/swagger-ui/**", "/swagger-ui.html").hasRole("ADMIN");
                    }
                    auth
                            // P0-3: GET /api/v1/prices** — чтение цен для ВСЕХ аутентифицированных
                            // (страницы походов обычного USER). Эндпоинт лежит вне /api/v1/admin/**,
                            // поэтому его открывает любое из правил ниже + anyRequest().authenticated();
                            // явное правило добавлено для читаемости и защиты от будущих правок.
                            .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/prices", "/api/v1/prices/**").authenticated()
                            .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                            .anyRequest().authenticated();
                })
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
        // РЕШЕНИЕ (аудит 29.10.2026, подзадача 9): allowCredentials=false — осознанно.
        // Аутентификация stateless: access/refresh-токены клиент хранит сам и шлёт
        // заголовком Authorization: Bearer; cookie-сессий нет (SessionCreationPolicy.STATELESS),
        // поэтому credentials в CORS-смысле (cookie/HTTP-auth) не передаются.
        // Следствия, которые нельзя нарушать будущими правками:
        //  1) если появится cookie-based auth — здесь потребуется allowCredentials(true)
        //     и ТОЧЕЧНЫЕ origins (никогда "*" вместе с credentials);
        //  2) allowedHeaders намеренно узкий (Authorization, Content-Type) — кастомные
        //     заголовки добавлять явно, а не "*".
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
