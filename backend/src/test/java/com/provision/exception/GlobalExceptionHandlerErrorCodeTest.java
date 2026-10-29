package com.provision.exception;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
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

/**
 * Контракты новых кодов ошибок {@link GlobalExceptionHandler} (AU-14, внешний аудит
 * 30.10.2026): 413 на превышение лимита загрузки, 409 на нарушение целостности и на
 * конфликт оптимистичной блокировки.
 *
 * <p>Слой теста — unit (R2): совет контроллеров проверяется через
 * {@link MockMvcBuilders#standaloneSetup} без Spring-контекста и БД. Это ровно тот слой,
 * где живёт изменение (маппинг исключение → HTTP-код/тело); интеграционные сьюты
 * {@code ConflictIntegrationTest}/{@code SecurityIntegrationTest} покрывают путь через
 * реальный фильтр-чейн и дублировать их здесь не нужно.</p>
 *
 * <p>Отдельно закреплено, что внутренние детали НЕ утекают в тело ответа: у
 * {@code DataIntegrityViolationException} в сообщении имена таблиц, колонок и значения
 * уникальных ключей, у {@code MaxUploadSizeExceededException} — internals разбора
 * multipart у Tomcat. Оба наружу не отдаются (подробности остаются в логе с traceId, R10).</p>
 */
@DisplayName("GlobalExceptionHandler: 413 / 409 (AU-14)")
class GlobalExceptionHandlerErrorCodeTest {

    /** Лимит из application.yml; в standalone-сборке @Value не инжектится, ставим явно. */
    private static final String MAX_FILE_SIZE = "96MB";

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        GlobalExceptionHandler advice = new GlobalExceptionHandler();
        ReflectionTestUtils.setField(advice, "maxFileSize", MAX_FILE_SIZE);
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(advice)
                .build();
    }

    @Test
    @DisplayName("413 FILE_TOO_LARGE: файл больше лимита — с фактическим лимитом из конфигурации")
    void uploadTooLarge_returns413WithConfiguredLimit() throws Exception {
        mockMvc.perform(get("/probe/too-large"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.type").value("about:blank"))
                .andExpect(jsonPath("$.title").value("Payload Too Large"))
                .andExpect(jsonPath("$.status").value(HttpStatus.PAYLOAD_TOO_LARGE.value()))
                .andExpect(jsonPath("$.instance").value("/probe/too-large"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("FILE_TOO_LARGE")))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(MAX_FILE_SIZE)))
                // internals контейнера наружу не отдаём
                .andExpect(jsonPath("$.detail").value(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("commons-fileupload"))));
    }

    @Test
    @DisplayName("409 DATA_CONFLICT: нарушение уникальности — без имён таблиц и SQL в теле")
    void dataIntegrityViolation_returns409WithoutLeakingSchema() throws Exception {
        mockMvc.perform(get("/probe/integrity"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflict"))
                .andExpect(jsonPath("$.status").value(HttpStatus.CONFLICT.value()))
                .andExpect(jsonPath("$.instance").value("/probe/integrity"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("DATA_CONFLICT")))
                .andExpect(jsonPath("$.detail").value(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("users_email_key"))))
                .andExpect(jsonPath("$.detail").value(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("ERROR:"))));
    }

    @Test
    @DisplayName("409 CONCURRENT_MODIFICATION: конфликт оптимистичной блокировки")
    void optimisticLock_returns409() throws Exception {
        mockMvc.perform(get("/probe/lock"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(HttpStatus.CONFLICT.value()))
                .andExpect(jsonPath("$.detail").value(
                        org.hamcrest.Matchers.containsString("CONCURRENT_MODIFICATION")));
    }

    /**
     * Регрессионная страховка: новый хелпер {@code build(...)} не должен был поменять
     * поведение catch-all — 500 по-прежнему без внутренних подробностей.
     */
    @Test
    @DisplayName("500 остаётся без внутренних деталей (регрессия catch-all)")
    void genericException_stillHidesInternals() throws Exception {
        mockMvc.perform(get("/probe/generic"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.title").value("Internal Server Error"))
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred"))
                .andExpect(jsonPath("$.detail").value(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("SECRET-INTERNAL"))));
    }

    /** Минимальный контроллер-пробник: каждый метод бросает одно целевое исключение. */
    @RestController
    @RequestMapping("/probe")
    static class ProbeController {

        @GetMapping("/too-large")
        void tooLarge() {
            // 96 МБ = 100663296 — тот же предел, что в EMIS_UPLOAD_MAX_FILE_SIZE
            throw new MaxUploadSizeExceededException(100_663_296L);
        }

        @GetMapping("/integrity")
        void integrity() {
            throw new DataIntegrityViolationException(
                    "could not execute statement; SQL [n/a]; constraint [users_email_key]; "
                            + "ERROR: duplicate key value violates unique constraint \"users_email_key\"");
        }

        @GetMapping("/lock")
        void lock() {
            throw new OptimisticLockingFailureException(
                    "Row was updated or deleted by another transaction (or unsaved-value mapping was incorrect)");
        }

        @GetMapping("/generic")
        void generic() {
            throw new IllegalStateException("SECRET-INTERNAL: так делать нельзя, id=42");
        }
    }
}
