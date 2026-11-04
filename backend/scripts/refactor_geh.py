import re
p = "D:/Study/Code/meal-provisioning-ai/backend/src/main/java/com/provision/exception/GlobalExceptionHandler.java"
s = open(p, encoding="utf-8").read()

repls = [
('''        log.warn("Not found: {}", ex.getMessage());
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
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);''',
'''        log.warn("Not found: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Not Found",
                HttpStatus.NOT_FOUND.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);'''),

('''        log.warn("Conflict: {}", ex.getMessage());
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
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);''',
'''        log.warn("Conflict: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Conflict",
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request
        );
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);'''),

('''        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Conflict",
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                ex.getUsedIn(),
                null
        );''',
'''        ErrorResponse error = ErrorResponseFactory.body(
                "Conflict",
                HttpStatus.CONFLICT.value(),
                ex.getMessage(),
                request,
                null,
                ex.getUsedIn()
        );'''),

('''        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Validation Error",
                HttpStatus.BAD_REQUEST.value(),
                "Validation failed",
                request.getRequestURI(),
                LocalDateTime.now(),
                fieldErrors,
                null,
                null
        );''',
'''        ErrorResponse error = ErrorResponseFactory.body(
                "Validation Error",
                HttpStatus.BAD_REQUEST.value(),
                "Validation failed",
                request,
                fieldErrors,
                null
        );'''),

('''        log.warn("Access denied: {}", ex.getMessage());
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
        );''',
'''        log.warn("Access denied: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Forbidden",
                HttpStatus.FORBIDDEN.value(),
                "Access denied",
                request
        );'''),

('''        log.warn("Forbidden: {}", ex.getMessage());
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
        );''',
'''        log.warn("Forbidden: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Forbidden",
                HttpStatus.FORBIDDEN.value(),
                ex.getMessage(),
                request
        );'''),

('''        log.warn("Unauthorized: {}", ex.getMessage());
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
        );''',
'''        log.warn("Unauthorized: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Unauthorized",
                HttpStatus.UNAUTHORIZED.value(),
                ex.getMessage(),
                request
        );'''),

('''        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Too Many Requests",
                HttpStatus.TOO_MANY_REQUESTS.value(),
                ex.getMessage(),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );''',
'''        ErrorResponse error = ErrorResponseFactory.body(
                "Too Many Requests",
                HttpStatus.TOO_MANY_REQUESTS.value(),
                ex.getMessage(),
                request
        );'''),

('''        log.warn("Validation error: {}", ex.getMessage());
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
        );''',
'''        log.warn("Validation error: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Validation Error",
                HttpStatus.BAD_REQUEST.value(),
                ex.getMessage(),
                request
        );'''),

('''        log.error("Integration unavailable: {}", ex.getMessage());
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
        );''',
'''        log.error("Integration unavailable: {}", ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Bad Gateway",
                HttpStatus.BAD_GATEWAY.value(),
                ex.getMessage(),
                request
        );'''),

('''        // KB-27: сообщение IAE — внутреннее (имена полей/состояний), в prod наружу не отдаём.
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                internalDetail(ex, SAFE_BAD_REQUEST),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );''',
'''        // KB-27: сообщение IAE — внутреннее (имена полей/состояний), в prod наружу не отдаём.
        ErrorResponse error = ErrorResponseFactory.body(
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                internalDetail(ex, SAFE_BAD_REQUEST),
                request
        );'''),

('''        log.warn("Malformed request body for {}: {}", request.getRequestURI(), ex.getMessage());
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
        );''',
'''        log.warn("Malformed request body for {}: {}", request.getRequestURI(), ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                "Malformed request body",
                request
        );'''),

('''        log.warn("Argument type mismatch for {}: {}", request.getRequestURI(), ex.getMessage());
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
        );''',
'''        log.warn("Argument type mismatch for {}: {}", request.getRequestURI(), ex.getMessage());
        ErrorResponse error = ErrorResponseFactory.body(
                "Bad Request",
                HttpStatus.BAD_REQUEST.value(),
                "Invalid value for parameter '" + ex.getName() + "'",
                request
        );'''),

('''        // KB-27: текст ошибки каркаса (перечень поддерживаемых методов) — внутренний.
        ErrorResponse error = new ErrorResponse(
                "about:blank",
                "Method Not Allowed",
                HttpStatus.METHOD_NOT_ALLOWED.value(),
                internalDetail(ex, SAFE_METHOD_NOT_ALLOWED),
                request.getRequestURI(),
                LocalDateTime.now(),
                null,
                null,
                null
        );''',
'''        // KB-27: текст ошибки каркаса (перечень поддерживаемых методов) — внутренний.
        ErrorResponse error = ErrorResponseFactory.body(
                "Method Not Allowed",
                HttpStatus.METHOD_NOT_ALLOWED.value(),
                internalDetail(ex, SAFE_METHOD_NOT_ALLOWED),
                request
        );'''),

('''        log.error("Unexpected error", ex);
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
        );''',
'''        log.error("Unexpected error", ex);
        ErrorResponse error = ErrorResponseFactory.body(
                "Internal Server Error",
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "An unexpected error occurred",
                request
        );'''),

('''    private ResponseEntity<ErrorResponse> build(
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
    }''',
'''    private ResponseEntity<ErrorResponse> build(
            HttpStatus status, String title, String detail, HttpServletRequest request
    ) {
        return ResponseEntity.status(status).body(
                ErrorResponseFactory.body(title, status.value(), detail, request));
    }'''),
]

for old,new in repls:
    if old not in s:
        print("NOT FOUND:\n", old[:80])
    s = s.replace(old,new)

s = s.replace("import com.provision.dto.error.ErrorResponse;",
              "import com.provision.dto.error.ErrorResponse;\nimport com.provision.exception.ErrorResponseFactory;")

open(p,"w",encoding="utf-8").write(s)
print("done")
PY