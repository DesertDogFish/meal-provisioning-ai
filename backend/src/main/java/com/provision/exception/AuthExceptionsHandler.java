package com.provision.exception;

import com.provision.dto.error.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class AuthExceptionsHandler {

    private final Environment environment;

    public AuthExceptionsHandler(Environment environment) {
        this.environment = environment;
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(
            AccessDeniedException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Access denied: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Forbidden",
                HttpStatus.FORBIDDEN.value(),
                "Access denied",
                request
        );
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(
            ForbiddenException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Forbidden: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Forbidden",
                HttpStatus.FORBIDDEN.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ErrorResponse> handleUnauthorized(
            UnauthorizedException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Unauthorized: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Unauthorized",
                HttpStatus.UNAUTHORIZED.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error);
    }

    @ExceptionHandler(com.provision.exception.TooManyRequestsException.class)
    public ResponseEntity<ErrorResponse> handleTooManyRequests(
            com.provision.exception.TooManyRequestsException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Too many requests: {} (retryAfterSec={})", ex.getMessage(), ex.getRetryAfterSeconds());
        ErrorResponse error = ErrorResponseFactory.body(
                "Too Many Requests",
                HttpStatus.TOO_MANY_REQUESTS.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(error);
    }
}
