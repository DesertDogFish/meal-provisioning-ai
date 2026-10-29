package com.provision.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Кладёт traceId в MDC на время запроса (аудит 29.10.2026, подзадачи 15/18, R10).
 *
 * <p>Источник — заголовок {@code X-Request-Id} (его может выставить nginx/клиент),
 * иначе генерируется короткий UUID. Значение попадает в паттерн лога
 * ({@code logging.pattern.level} в application.yml) и возвращается ответным
 * заголовком — инцидент находится в логах по id из ответа. Фоновые {@code @Async}
 * потоки наследуют MDC через {@link AsyncConfig#mdcTaskDecorator()}.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

    public static final String TRACE_ID_KEY = "traceId";
    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    private static final int MAX_HEADER_ID_LENGTH = 64;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String traceId = sanitize(request.getHeader(REQUEST_ID_HEADER));
        if (traceId == null) {
            traceId = UUID.randomUUID().toString().substring(0, 8);
        }
        MDC.put(TRACE_ID_KEY, traceId);
        response.setHeader(REQUEST_ID_HEADER, traceId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(TRACE_ID_KEY);
        }
    }

    /** Защита от log-injection: только безопасные символы, ограниченная длина. */
    private static String sanitize(String header) {
        if (header == null || header.isBlank() || header.length() > MAX_HEADER_ID_LENGTH) {
            return null;
        }
        return header.chars().allMatch(c -> Character.isLetterOrDigit(c) || c == '-' || c == '_')
                ? header
                : null;
    }
}
