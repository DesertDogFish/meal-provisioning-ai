package com.provision.exception;

import com.provision.dto.error.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Slf4j
@RestControllerAdvice
public class WebExceptionsHandler {

    private static final String SAFE_BAD_REQUEST =
            "BAD_REQUEST: Некорректный запрос — проверьте параметры и повторите.";
    private static final String SAFE_METHOD_NOT_ALLOWED =
            "METHOD_NOT_ALLOWED: Метод не поддерживается для этого адреса.";

    @Value("${spring.servlet.multipart.max-file-size:96MB}")
    private String maxFileSize;

    private final Environment environment;

    public WebExceptionsHandler(Environment environment) {
        this.environment = environment;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(
            IllegalArgumentException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Illegal argument: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                internalDetail(ex, SAFE_BAD_REQUEST),
                request
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(
            org.springframework.http.converter.HttpMessageNotReadableException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Malformed request body for {}: {}", request.getRequestURI(), ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                "Malformed request body",
                request
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Argument type mismatch for {}: {}", request.getRequestURI(), ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                "Invalid value for parameter '" + ex.getName() + "'",
                request
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Method not supported for {}: {}", request.getRequestURI(), ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Method Not Allowed",
                HttpStatus.METHOD_NOT_ALLOWED.value(),
                internalDetail(ex, SAFE_METHOD_NOT_ALLOWED),
                request
        );
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(error);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleMaxUploadSize(
            MaxUploadSizeExceededException ex,
            HttpServletRequest request
    ) {
        long actual = ex.getMaxUploadSize();
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Upload too large for {}: limit={} (configured {}), actual={} bytes",
                request.getRequestURI(), maxFileSize, maxFileSize, actual > 0 ? actual : "unknown");
        return build(HttpStatus.PAYLOAD_TOO_LARGE, "Payload Too Large",
                "FILE_TOO_LARGE: Файл больше допустимого размера (" + maxFileSize
                        + "). Выгрузка ЕМИСС целиком весит около 65 МБ — проверьте, что загружаете "
                        + "SDMX-ответ портала, а не архив или выгрузку за все годы.",
                request);
    }

    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<ErrorResponse> handleUnknownRoute(
            Exception ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.warn("Unknown route: {} {} ({})",
                request.getMethod(), request.getRequestURI(), ex.getClass().getSimpleName());
        return build(HttpStatus.NOT_FOUND, "Not Found",
                "Resource not found: " + request.getRequestURI(), request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(
            Exception ex,
            HttpServletRequest request
    ) {
        ErrorResponseFactory.resolveTraceId(request);
        log.error("Unexpected error", ex);
        ErrorResponse error = ErrorResponseFactory.body(
                "Internal Server Error",
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "An unexpected error occurred",
                request
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }

    private String internalDetail(Throwable ex, String safeMessage) {
        if (!isDiagnosticProfile()) {
            return safeMessage;
        }
        String message = ex.getMessage();
        return message == null || message.isBlank() ? safeMessage : message;
    }

    private boolean isDiagnosticProfile() {
        if (environment == null) {
            return false;
        }
        return environment.acceptsProfiles(Profiles.of("dev"))
                || environment.acceptsProfiles(Profiles.of("development"))
                || environment.acceptsProfiles(Profiles.of("test"));
    }

    private ResponseEntity<ErrorResponse> build(
            HttpStatus status, String title, String detail, HttpServletRequest request
    ) {
        return ResponseEntity.status(status).body(
                ErrorResponseFactory.body(title, status.value(), detail, request));
    }
}
