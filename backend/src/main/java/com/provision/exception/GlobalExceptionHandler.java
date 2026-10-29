package com.provision.exception;

import com.provision.dto.error.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.time.LocalDateTime;
import java.util.List;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    /**
     * Предел размера загружаемого файла — для текста 413 (AU-14). Берём из той же
     * настройки, которой ограничивает загрузку Spring, чтобы сообщение не расходилось
     * с фактическим лимитом после правки {@code EMIS_UPLOAD_MAX_FILE_SIZE}.
     */
    @Value("${spring.servlet.multipart.max-file-size:96MB}")
    private String maxFileSize;

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(
            NotFoundException ex,
            HttpServletRequest request
    ) {
        log.warn("Not found: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Not Found",
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(
            ConflictException ex,
            HttpServletRequest request
    ) {
        log.warn("Conflict: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Conflict",
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    /**
     * FIX (P1, аудит Phase 11): PRODUCT_IN_USE — кладём список блокирующих ресурсов
     * в поле usedIn ответа (раньше всегда был null из-за @JsonInclude(NON_NULL)).
     */
    @ExceptionHandler(com.provision.exception.ProductInUseConflictException.class)
    public ResponseEntity<ErrorResponse> handleProductInUse(
            com.provision.exception.ProductInUseConflictException ex,
            HttpServletRequest request
    ) {
        log.warn("Conflict (PRODUCT_IN_USE): {} — usedIn={}", ex.getMessage(),
                ex.getUsedIn() != null ? ex.getUsedIn().size() : 0);
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Conflict",
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                ex.getUsedIn(),
                null
        );
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException ex,
            HttpServletRequest request
    ) {
        List<ErrorResponse.FieldError> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new ErrorResponse.FieldError(
                        error.getField(),
                        error.getDefaultMessage(),
                        error.getRejectedValue()
                ))
                .toList();

        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Validation Error",
                HttpStatus.BAD_REQUEST.value(),
                "Validation failed",
                request.getRequestURI(),
                LocalDateTime.now(),
                fieldErrors,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(
            AccessDeniedException ex,
            HttpServletRequest request
    ) {
        log.warn("Access denied: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Forbidden",
                HttpStatus.FORBIDDEN.value(),
                "Access denied",
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(
            ForbiddenException ex,
            HttpServletRequest request
    ) {
        log.warn("Forbidden: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Forbidden",
                HttpStatus.FORBIDDEN.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ErrorResponse> handleUnauthorized(
            UnauthorizedException ex,
            HttpServletRequest request
    ) {
        log.warn("Unauthorized: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Unauthorized",
                HttpStatus.UNAUTHORIZED.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error);
    }

    /**
     * 429 + Retry-After (аудит 29.10.2026, подзадача 19): brute-force guard
     * {@link com.provision.security.LoginAttemptService}.
     */
    @ExceptionHandler(com.provision.exception.TooManyRequestsException.class)
    public ResponseEntity<ErrorResponse> handleTooManyRequests(
            com.provision.exception.TooManyRequestsException ex,
            HttpServletRequest request
    ) {
        log.warn("Too many requests: {} (retryAfterSec={})", ex.getMessage(), ex.getRetryAfterSeconds());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Too Many Requests",
                HttpStatus.TOO_MANY_REQUESTS.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(error);
    }

    @ExceptionHandler(com.provision.exception.ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            com.provision.exception.ValidationException ex,
            HttpServletRequest request
    ) {
        log.warn("Validation error: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Validation Error",
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(com.provision.exception.IntegrationUnavailableException.class)
    public ResponseEntity<ErrorResponse> handleIntegrationUnavailable(
            com.provision.exception.IntegrationUnavailableException ex,
            HttpServletRequest request
    ) {
        // Fix-13: внешний интеграционный сервис (ЕМИСС/Росстат) недоступен или
        // ответил не тем — не наш баг: 502 вместо 500.
        log.error("Integration unavailable: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Bad Gateway",
                HttpStatus.BAD_GATEWAY.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(error);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(
            IllegalArgumentException ex,
            HttpServletRequest request
    ) {
        log.warn("Illegal argument: {}", ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Битый/нечитаемый JSON тела (например, ingredientId: "free-..." вместо числа) —
     * это ошибка клиента (400), а не «Unexpected error» (500): UI получает внятный
     * detail и может показать его пользователю.
     */
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(
            org.springframework.http.converter.HttpMessageNotReadableException ex,
            HttpServletRequest request
    ) {
        log.warn("Malformed request body for {}: {}", request.getRequestURI(), ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                "Malformed request body",
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**PathParam/query не того типа (например, нечисловой id) — тоже 400. */
    @ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException ex,
            HttpServletRequest request
    ) {
        log.warn("Argument type mismatch for {}: {}", request.getRequestURI(), ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                "Invalid value for parameter '" + ex.getName() + "'",
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /** Метод не поддерживается эндпоинтом — 405, а не 500. */
    @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotSupported(
            org.springframework.web.HttpRequestMethodNotSupportedException ex,
            HttpServletRequest request
    ) {
        log.warn("Method not supported for {}: {}", request.getRequestURI(), ex.getMessage());
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Method Not Allowed",
                HttpStatus.METHOD_NOT_ALLOWED.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(error);
    }

    /**
     * Файл больше {@code spring.servlet.multipart.max-file-size} — 413, а не 500 (AU-14,
     * внешний аудит 30.10.2026). Штатный сценарий для этого пути: полная выгрузка ЕМИСС
     * весит ~65 МБ при лимите 96 МБ, поэтому админ реально может прислать файл больше
     * лимита и должен увидеть причину, а не «An unexpected error occurred».
     *
     * <p>{@code ex.getMessage()} наружу не отдаём: у Tomcat там внутренние детали
     * разбора multipart. Лимит берём из конфигурации.</p>
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleMaxUploadSize(
            MaxUploadSizeExceededException ex,
            HttpServletRequest request
    ) {
        long actual = ex.getMaxUploadSize();
        log.warn("Upload too large for {}: limit={} (configured {}), actual={} bytes",
                request.getRequestURI(), maxFileSize, maxFileSize, actual > 0 ? actual : "unknown");
        return build(HttpStatus.PAYLOAD_TOO_LARGE, "Payload Too Large",
                "FILE_TOO_LARGE: Файл больше допустимого размера (" + maxFileSize
                        + "). Выгрузка ЕМИСС целиком весит около 65 МБ — проверьте, что загружаете "
                        + "SDMX-ответ портала, а не архив или выгрузку за все годы.",
                request);
    }

    /**
     * Нарушение ограничения целостности БД — 409, а не 500 (AU-14).
     *
     * <p>Типовой источник: check-then-act в {@code AuthService.register}
     * ({@code existsByEmail} → {@code save}) — при двух одновременных регистрациях одного
     * email вторая упирается в {@code users_email_key}. После AU-03 сюда же попадает
     * частичный уникальный индекс {@code uq_sync_logs_running} (два параллельных синка).</p>
     *
     * <p>ВАЖНО: {@code ex.getMessage()} наружу НЕ отдаём — там имена таблиц, колонок,
     * значения уникальных ключей и фрагменты SQL. Клиенту уходит стабильный код,
     * подробности остаются в логе с traceId (R10).</p>
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(
            DataIntegrityViolationException ex,
            HttpServletRequest request
    ) {
        // Логируем полную причину: без неё расследовать конфликт уникальности невозможно.
        log.error("Data integrity violation on {}: {}", request.getRequestURI(), ex.getMostSpecificCause().getMessage());
        return build(HttpStatus.CONFLICT, "Conflict",
                "DATA_CONFLICT: Запись конфликтует с существующими данными. Если это регистрация — "
                        + "такой email уже занят; если запуск синхронизации — она уже выполняется.",
                request);
    }

    /**
     * Конфликт оптимистичной блокировки — 409 (AU-14, готовится под AU-13: {@code @Version}
     * на изменяемых агрегатах). Без обработчика потерянное обновление выглядело бы как 500.
     */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ErrorResponse> handleOptimisticLock(
            OptimisticLockingFailureException ex,
            HttpServletRequest request
    ) {
        log.warn("Concurrent modification on {}: {}", request.getRequestURI(), ex.getMessage());
        return build(HttpStatus.CONFLICT, "Conflict",
                "CONCURRENT_MODIFICATION: Данные изменились, пока вы их редактировали. "
                        + "Обновите страницу и повторите правку.",
                request);
    }

    /**
     * Сборка ответа об ошибке без 9-позиционного конструктора (AU-14; полная миграция
     * остальных 14 обработчиков на эту фабрику — задача AU-15).
     */
    private ResponseEntity<ErrorResponse> build(
            HttpStatus status, String title, String detail, HttpServletRequest request
    ) {
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                title,
                status.value(),
                detail,
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(status).body(error);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(
            Exception ex,
            HttpServletRequest request
    ) {
        log.error("Unexpected error", ex);
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Internal Server Error",
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "An unexpected error occurred",
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
