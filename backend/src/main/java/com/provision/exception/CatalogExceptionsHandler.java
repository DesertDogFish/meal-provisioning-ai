package com.provision.exception;

import com.provision.dto.error.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class CatalogExceptionsHandler {

    private final Environment environment;

    public CatalogExceptionsHandler(Environment environment) {
        this.environment = environment;
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(
            NotFoundException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Not found: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Not Found",
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(
            ConflictException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Conflict: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Conflict",
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    @ExceptionHandler(com.provision.exception.ProductInUseConflictException.class)
    public ResponseEntity<ErrorResponse> handleProductInUse(
            com.provision.exception.ProductInUseConflictException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Conflict (PRODUCT_IN_USE): {} — usedIn={}", ex.getMessage(),
                ex.getUsedIn() != null ? ex.getUsedIn().size() : 0);
        ErrorResponse error = ErrorResponseFactory.body(
                "Conflict",
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request,
                null,
                ex.getUsedIn()
        );
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    @ExceptionHandler(com.provision.exception.ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(
            com.provision.exception.ValidationException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Validation error: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Validation Error",
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        List<ErrorResponse.FieldError> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new ErrorResponse.FieldError(
                        error.getField(),
                        error.getDefaultMessage(),
                        error.getRejectedValue()
                ))
                .toList();

        ErrorResponse error = ErrorResponseFactory.body(
                "Validation Error",
                HttpStatus.BAD_REQUEST.value(),
                "Validation failed",
                request,
                fieldErrors,
                null
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }
}
