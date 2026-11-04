package com.provision.exception;

import com.provision.dto.error.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class IntegrationExceptionsHandler {

    private final Environment environment;

    public IntegrationExceptionsHandler(Environment environment) {
        this.environment = environment;
    }

    @ExceptionHandler(com.provision.exception.IntegrationUnavailableException.class)
    public ResponseEntity<ErrorResponse> handleIntegrationUnavailable(
            com.provision.exception.IntegrationUnavailableException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.error("Integration unavailable: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Bad Gateway",
                HttpStatus.BAD_GATEWAY.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(error);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(
            DataIntegrityViolationException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.error("Data integrity violation on {}: {}", request.getRequestURI(),
                ex.getMostSpecificCause().getMessage());
        return build(HttpStatus.CONFLICT, "Conflict",
                "DATA_CONFLICT: Запись конфликтует с существующими данными. Если это регистрация — "
                        + "такой email уже занят; если запуск синхронизации — она уже выполняется.",
                request);
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ErrorResponse> handleOptimisticLock(
            OptimisticLockingFailureException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Concurrent modification on {}: {}", request.getRequestURI(), ex.getMessage());
        return build(HttpStatus.CONFLICT, "Conflict",
                "CONCURRENT_MODIFICATION: Данные изменились, пока вы их редактировали. "
                        + "Обновите страницу и повторите правку.",
                request);
    }

    private ResponseEntity<ErrorResponse> build(
            HttpStatus status, String title, String detail, HttpServletRequest request
    ) {
        return ResponseEntity.status(status).body(
                ErrorResponseFactory.body(title, status.value(), detail, request));
    }
}
