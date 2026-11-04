package com.provision.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DisplayName("GlobalExceptionHandler: traceId for every exception type")
class GlobalExceptionHandlerTraceIdCoverageTest {

    private static final String TID = "cov-trace-1";

    private MockMvc mvc() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");
        AuthExceptionsHandler auth = new AuthExceptionsHandler(environment);
        CatalogExceptionsHandler catalog = new CatalogExceptionsHandler(environment);
        IntegrationExceptionsHandler integration = new IntegrationExceptionsHandler(environment);
        WebExceptionsHandler web = new WebExceptionsHandler(environment);
        ReflectionTestUtils.setField(web, "maxFileSize", "96MB");
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        return MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(auth, catalog, integration, web)
                .setValidator(validator)
                .build();
    }

    private org.springframework.test.web.servlet.ResultActions withTrace(org.springframework.test.web.servlet.RequestBuilder rb) throws Exception {
        return mvc().perform(rb);
    }

    @Test
    void notFound() throws Exception {
        mvc().perform(get("/probe/not-found").header("X-Request-Id", TID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Not Found"))
                .andExpect(jsonPath("$.status").value(HttpStatus.NOT_FOUND.value()))
                .andExpect(jsonPath("$.detail").value("nf"))
                .andExpect(jsonPath("$.instance").value("/probe/not-found"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void conflict() throws Exception {
        mvc().perform(get("/probe/conflict").header("X-Request-Id", TID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"))
                .andExpect(jsonPath("$.status").value(HttpStatus.CONFLICT.value()))
                .andExpect(jsonPath("$.detail").value("cf"))
                .andExpect(jsonPath("$.instance").value("/probe/conflict"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void productInUse() throws Exception {
        mvc().perform(get("/probe/product-in-use").header("X-Request-Id", TID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"))
                .andExpect(jsonPath("$.status").value(HttpStatus.CONFLICT.value()))
                .andExpect(jsonPath("$.detail").value("in use"))
                .andExpect(jsonPath("$.instance").value("/probe/product-in-use"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void accessDenied() throws Exception {
        mvc().perform(get("/probe/access-denied").header("X-Request-Id", TID))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.title").value("Forbidden"))
                .andExpect(jsonPath("$.status").value(HttpStatus.FORBIDDEN.value()))
                .andExpect(jsonPath("$.detail").value("Access denied"))
                .andExpect(jsonPath("$.instance").value("/probe/access-denied"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void forbidden() throws Exception {
        mvc().perform(get("/probe/forbidden").header("X-Request-Id", TID))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.title").value("Forbidden"))
                .andExpect(jsonPath("$.status").value(HttpStatus.FORBIDDEN.value()))
                .andExpect(jsonPath("$.detail").value("forbidden"))
                .andExpect(jsonPath("$.instance").value("/probe/forbidden"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void unauthorized() throws Exception {
        mvc().perform(get("/probe/unauthorized").header("X-Request-Id", TID))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.title").value("Unauthorized"))
                .andExpect(jsonPath("$.status").value(HttpStatus.UNAUTHORIZED.value()))
                .andExpect(jsonPath("$.detail").value("unauth"))
                .andExpect(jsonPath("$.instance").value("/probe/unauthorized"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void tooManyRequests() throws Exception {
        mvc().perform(get("/probe/too-many").header("X-Request-Id", TID))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.title").value("Too Many Requests"))
                .andExpect(jsonPath("$.status").value(HttpStatus.TOO_MANY_REQUESTS.value()))
                .andExpect(jsonPath("$.detail").value("too many"))
                .andExpect(jsonPath("$.instance").value("/probe/too-many"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void validationException() throws Exception {
        mvc().perform(get("/probe/validation-ex").header("X-Request-Id", TID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Validation Error"))
                .andExpect(jsonPath("$.status").value(HttpStatus.BAD_REQUEST.value()))
                .andExpect(jsonPath("$.detail").value("bad"))
                .andExpect(jsonPath("$.instance").value("/probe/validation-ex"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void integrationUnavailable() throws Exception {
        mvc().perform(get("/probe/integration").header("X-Request-Id", TID))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.title").value("Bad Gateway"))
                .andExpect(jsonPath("$.status").value(HttpStatus.BAD_GATEWAY.value()))
                .andExpect(jsonPath("$.detail").value("down"))
                .andExpect(jsonPath("$.instance").value("/probe/integration"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void illegalArgument() throws Exception {
        mvc().perform(get("/probe/illegal-argument").header("X-Request-Id", TID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Bad Request"))
                .andExpect(jsonPath("$.status").value(HttpStatus.BAD_REQUEST.value()))
                .andExpect(jsonPath("$.detail").value("secret: bad"))
                .andExpect(jsonPath("$.instance").value("/probe/illegal-argument"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void typeMismatch() throws Exception {
        mvc().perform(get("/probe/type-mismatch").param("id", "abc").header("X-Request-Id", TID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Bad Request"))
                .andExpect(jsonPath("$.status").value(HttpStatus.BAD_REQUEST.value()))
                .andExpect(jsonPath("$.detail").value("Invalid value for parameter 'id'"))
                .andExpect(jsonPath("$.instance").value("/probe/type-mismatch"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void methodNotSupported() throws Exception {
        mvc().perform(post("/probe/get-only").header("X-Request-Id", TID))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.title").value("Method Not Allowed"))
                .andExpect(jsonPath("$.status").value(HttpStatus.METHOD_NOT_ALLOWED.value()))
                .andExpect(jsonPath("$.instance").value("/probe/get-only"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void maxUpload() throws Exception {
        mvc().perform(get("/probe/too-large").header("X-Request-Id", TID))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.title").value("Payload Too Large"))
                .andExpect(jsonPath("$.status").value(HttpStatus.PAYLOAD_TOO_LARGE.value()))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("FILE_TOO_LARGE")))
                .andExpect(jsonPath("$.instance").value("/probe/too-large"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void dataIntegrity() throws Exception {
        mvc().perform(get("/probe/integrity").header("X-Request-Id", TID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"))
                .andExpect(jsonPath("$.status").value(HttpStatus.CONFLICT.value()))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("DATA_CONFLICT")))
                .andExpect(jsonPath("$.instance").value("/probe/integrity"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void optimisticLock() throws Exception {
        mvc().perform(get("/probe/lock").header("X-Request-Id", TID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"))
                .andExpect(jsonPath("$.status").value(HttpStatus.CONFLICT.value()))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("CONCURRENT_MODIFICATION")))
                .andExpect(jsonPath("$.instance").value("/probe/lock"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void generic() throws Exception {
        mvc().perform(get("/probe/generic").header("X-Request-Id", TID))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.title").value("Internal Server Error"))
                .andExpect(jsonPath("$.status").value(HttpStatus.INTERNAL_SERVER_ERROR.value()))
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred"))
                .andExpect(jsonPath("$.instance").value("/probe/generic"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void methodArgumentNotValid() throws Exception {
        mvc().perform(post("/probe/valid-body").contentType("application/json").content("{}").header("X-Request-Id", TID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Validation Error"))
                .andExpect(jsonPath("$.status").value(HttpStatus.BAD_REQUEST.value()))
                .andExpect(jsonPath("$.detail").value("Validation failed"))
                .andExpect(jsonPath("$.instance").value("/probe/valid-body"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @Test
    void httpMessageNotReadable() throws Exception {
        mvc().perform(post("/probe/valid-body").contentType("application/json").content("{bad").header("X-Request-Id", TID))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Bad Request"))
                .andExpect(jsonPath("$.status").value(HttpStatus.BAD_REQUEST.value()))
                .andExpect(jsonPath("$.detail").value("Malformed request body"))
                .andExpect(jsonPath("$.instance").value("/probe/valid-body"))
                .andExpect(jsonPath("$.extensions.traceId").value(TID));
    }

    @RestController
    @RequestMapping("/probe")
    static class ProbeController {

        @GetMapping("/not-found")
        void notFound() { throw new NotFoundException("nf"); }

        @GetMapping("/conflict")
        void conflict() { throw new ConflictException("cf"); }

        @GetMapping("/product-in-use")
        void productInUse() { throw new ProductInUseConflictException("in use", java.util.List.of()); }

        @GetMapping("/access-denied")
        void accessDenied() { throw new AccessDeniedException("denied"); }

        @GetMapping("/forbidden")
        void forbidden() { throw new ForbiddenException("forbidden"); }

        @GetMapping("/unauthorized")
        void unauthorized() { throw new UnauthorizedException("unauth"); }

        @GetMapping("/too-many")
        void tooMany() { throw new TooManyRequestsException("too many", 60); }

        @GetMapping("/validation-ex")
        void validationEx() { throw new ValidationException("bad"); }

        @GetMapping("/integration")
        void integration() { throw new IntegrationUnavailableException("down"); }

        @GetMapping("/illegal-argument")
        void illegalArgument() { throw new IllegalArgumentException("secret: bad"); }

        @GetMapping("/type-mismatch")
        void typeMismatch(@RequestParam int id) { }

        @GetMapping("/get-only")
        void getOnly() { }

        @GetMapping("/too-large")
        void tooLarge() { throw new MaxUploadSizeExceededException(100_663_296L); }

        @GetMapping("/integrity")
        void integrity() { throw new DataIntegrityViolationException("dup"); }

        @GetMapping("/lock")
        void lock() { throw new OptimisticLockingFailureException("lock"); }

        @GetMapping("/generic")
        void generic() { throw new IllegalStateException("secret"); }

        public static class Body { @Min(1) public int value; }

        @PostMapping("/valid-body")
        void validBody(@Valid @RequestBody Body body) { }
    }
}