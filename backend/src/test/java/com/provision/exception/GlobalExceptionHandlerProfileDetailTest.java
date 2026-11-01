package com.provision.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Профиль-зависимая политика {@code detail} (KB-27, внешний аудит 30.10.2026, AU-27).
 *
 * <p>Проверяется граница «доменное ↔ внутреннее»: в профиле {@code prod} текст
 * внутреннего исключения ({@link IllegalArgumentException}, ошибки каркаса Spring MVC)
 * наружу не уходит — вместо него стабильный код, а доменный текст
 * ({@code NotFoundException}) остаётся, потому что его читает пользователь. В {@code dev}
 * текст исключения виден как есть.</p>
 *
 * <p>Слой теста — unit (R2): совет контроллеров через
 * {@link MockMvcBuilders#standaloneSetup}, без Spring-контекста и БД. Профиль
 * подставляется {@link MockEnvironment}-ом, ровно так же, как в бою его читает
 * {@code Environment.acceptsProfiles}.</p>
 */
@DisplayName("GlobalExceptionHandler: detail по профилю (KB-27)")
class GlobalExceptionHandlerProfileDetailTest {

    /** Маркер внутренних подробностей, который не должен попасть в prod-ответ. */
    private static final String SECRET = "SECRET-INTERNAL";

    private MockMvc mvc(String... activeProfiles) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(activeProfiles);
        GlobalExceptionHandler advice = new GlobalExceptionHandler(environment);
        ReflectionTestUtils.setField(advice, "maxFileSize", "96MB");
        return MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(advice)
                .build();
    }

    @Test
    @DisplayName("prod: detail IllegalArgumentException — safe-код вместо текста исключения")
    void prod_hidesIllegalArgumentMessage() throws Exception {
        mvc("prod").perform(get("/probe/illegal-argument"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Bad Request"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("BAD_REQUEST:")))
                .andExpect(jsonPath("$.detail").value(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(SECRET))));
    }

    @Test
    @DisplayName("prod: 405 — safe-код вместо текста каркаса (перечень методов не утекает)")
    void prod_hidesFrameworkMessage() throws Exception {
        mvc("prod").perform(get("/probe/method-not-supported"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("METHOD_NOT_ALLOWED:")))
                .andExpect(jsonPath("$.detail").value(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("PUT"))));
    }

    @Test
    @DisplayName("prod: доменный недоступный ресурс сохраняет пользовательский текст")
    void prod_keepsDomainMessage() throws Exception {
        mvc("prod").perform(get("/probe/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Поход не найден"));
    }

    @Test
    @DisplayName("dev: detail IllegalArgumentException — текст исключения для отладки")
    void dev_keepsIllegalArgumentMessage() throws Exception {
        mvc("dev").perform(get("/probe/illegal-argument"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(SECRET + ": так нельзя, id=42"));
    }

    @Test
    @DisplayName("без активного профиля (ручная сборка совета) — поведение dev")
    void noActiveProfile_keepsIllegalArgumentMessage() throws Exception {
        mvc().perform(get("/probe/illegal-argument"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(SECRET + ": так нельзя, id=42"));
    }

    @Test
    @DisplayName("пустое сообщение исключения не даёт null/пустой detail ни в одном профиле")
    void blankMessage_fallsBackToSafeDetailInAnyProfile() throws Exception {
        for (String[] profiles : new String[][]{{}, {"dev"}, {"prod"}}) {
            mvc(profiles).perform(get("/probe/illegal-argument-empty"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.startsWith("BAD_REQUEST:")));
        }
    }

    /** Минимальный контроллер-пробник: каждый метод бросает одно целевое исключение. */
    @RestController
    @RequestMapping("/probe")
    static class ProbeController {

        @GetMapping("/illegal-argument")
        void illegalArgument() {
            throw new IllegalArgumentException(SECRET + ": так нельзя, id=42");
        }

        @GetMapping("/illegal-argument-empty")
        void illegalArgumentEmpty() {
            throw new IllegalArgumentException();
        }

        @GetMapping("/method-not-supported")
        void methodNotSupported() throws HttpRequestMethodNotSupportedException {
            throw new HttpRequestMethodNotSupportedException("PUT");
        }

        @GetMapping("/not-found")
        void notFound() {
            throw new NotFoundException("Поход не найден");
        }
    }
}
