package com.provision.exception;

import com.provision.config.TraceIdFilter;
import com.provision.dto.error.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Единая фабрика тела ошибки (Problem Details). Собирает {@link ErrorResponse} и
 * автоматически добавляет {@code extensions.traceId}, коррелируя его с MDC/заголовком
 * {@code X-Request-Id} (R10). Все обработчики {@link GlobalExceptionHandler} должны
 * строить ответ только через эту фабрику, чтобы traceId присутствовал во всех ошибках.
 */
public final class ErrorResponseFactory {

    private ErrorResponseFactory() {
    }

    /**
     * Разрешает traceId запроса: сначала MDC (заполняется {@link TraceIdFilter}),
     * затем заголовок {@code X-Request-Id}, иначе генерируется короткий UUID.
     * Значение кладётся обратно в MDC, чтобы оно попало в логи обработчика.
     */
    public static String resolveTraceId(HttpServletRequest request) {
        String traceId = null;
        // Приоритет — заголовок запроса: он и есть источник истины для корреляции,
        // MDC может содержать устаревшее значение (например, между тестами в одном потоке).
        if (request != null) {
            traceId = TraceIdFilter.sanitize(request.getHeader(TraceIdFilter.REQUEST_ID_HEADER));
        }
        if (traceId == null || traceId.isBlank()) {
            traceId = MDC.get(TraceIdFilter.TRACE_ID_KEY);
        }
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString().substring(0, 8);
        }
        MDC.put(TraceIdFilter.TRACE_ID_KEY, traceId);
        return traceId;
    }

    /** Расширения ответа с traceId (всегда непустые). */
    public static Map<String, Object> traceExtensions(HttpServletRequest request) {
        return Map.of("traceId", resolveTraceId(request));
    }

    /** Полная сборка ErrorResponse с traceId в extensions. */
    public static ErrorResponse body(
            String title,
            int status,
            String detail,
            HttpServletRequest request,
            List<ErrorResponse.FieldError> fieldErrors,
            List<ErrorResponse.UsedInResource> usedIn
    ) {
        String instance = request != null ? request.getRequestURI() : null;
        return new ErrorResponse(
                "about:blank",
                title,
                status,
                detail,
                instance,
                LocalDateTime.now(),
                fieldErrors,
                usedIn,
                traceExtensions(request)
        );
    }

    public static ErrorResponse body(
            String title,
            int status,
            String detail,
            HttpServletRequest request
    ) {
        return body(title, status, detail, request, null, null);
    }
}