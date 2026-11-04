package com.provision.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DisplayName("GlobalExceptionHandler: traceId presence and correlation")
class GlobalExceptionHandlerTraceIdTest {

    private MockMvc mvc() {
        MockEnvironment environment = new MockEnvironment();
        GlobalExceptionHandler advice = new GlobalExceptionHandler(environment);
        ReflectionTestUtils.setField(advice, "maxFileSize", "96MB");
        return MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(advice)
                .build();
    }

    @Test
    void notFound_traceIdPresentAndCorrelated() throws Exception {
        mvc().perform(get("/probe/not-found").header("X-Request-Id", "trace-abc-123"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.extensions.traceId").value("trace-abc-123"));
    }

    @Test
    void generic_traceIdGeneratedWhenNoHeader() throws Exception {
        mvc().perform(get("/probe/generic"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.extensions.traceId").exists());
    }

    @Test
    void illegalArgument_traceIdPresent() throws Exception {
        mvc().perform(get("/probe/illegal-argument").header("X-Request-Id", "t-iae"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.extensions.traceId").value("t-iae"));
    }

    @Test
    void dataIntegrity_traceIdPresent() throws Exception {
        mvc().perform(get("/probe/integrity").header("X-Request-Id", "t-int"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.extensions.traceId").value("t-int"));
    }

    @Test
    void maxUpload_traceIdPresent() throws Exception {
        mvc().perform(get("/probe/too-large").header("X-Request-Id", "t-up"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.extensions.traceId").value("t-up"));
    }

    @RestController
    @RequestMapping("/probe")
    static class ProbeController {
        @GetMapping("/not-found")
        void notFound() { throw new NotFoundException("nf"); }

        @GetMapping("/generic")
        void generic() { throw new IllegalStateException("secret"); }

        @GetMapping("/illegal-argument")
        void illegalArgument() { throw new IllegalArgumentException("secret: bad"); }

        @GetMapping("/integrity")
        void integrity() { throw new DataIntegrityViolationException("dup"); }

        @GetMapping("/too-large")
        void tooLarge() { throw new MaxUploadSizeExceededException(100_663_296L); }
    }
}