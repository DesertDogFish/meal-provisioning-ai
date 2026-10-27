package com.provision.integration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Fix-9 (п.7, диагностика): воспроизводит полную цепочку биндинга учётки OFF
 * ровно как в рантайме: РЕАЛЬНЫЙ application.yml (classpath) → плейсхолдер
 * ${OFF_USER_ID:} → свойство integration.off.user-id → @Value-поле.
 *
 * Роль systemEnvironment играет MapPropertySource с теми же именами — для
 * PropertySourcesPropertyResolver разницы нет (env-переменная == свойство
 * окружения). Тест доказывает, что механизм исправен: если в контейнере
 * поле пустое при непустом env — причина НЕ в yml/плейсхолдерах (см. WARN
 * «OFF credentials not set — diagnostic» в логах провайдера: он печатает,
 * какое звено пустое: JVM env / Spring property / injected field).
 */
class OffConfigBindingTest {

    /** Зонд с теми же @Value-выражениями, что у OpenFoodFactsProvider. */
    static class Probe {
        @Value("${integration.off.user-id:}")
        String userId;
        @Value("${integration.off.password:}")
        String password;
    }

    private AnnotationConfigApplicationContext contextWith(Map<String, Object> envLike) throws Exception {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        if (envLike != null) {
            ctx.getEnvironment().getPropertySources().addFirst(
                    new MapPropertySource("envSim", envLike));
        }
        // реальный application.yml так же, как его грузит Spring Boot
        YamlPropertySourceLoader loader = new YamlPropertySourceLoader();
        List<PropertySource<?>> yaml = loader.load("application.yml",
                new ClassPathResource("application.yml"));
        assertEquals(1, yaml.size(), "application.yml должен грузиться одним документом");
        yaml.forEach(s -> ctx.getEnvironment().getPropertySources().addLast(s));
        ctx.registerBean(PropertySourcesPlaceholderConfigurer.class);
        ctx.registerBean(Probe.class);
        ctx.refresh();
        return ctx;
    }

    @Test
    void userIdAndPasswordBindThroughYmlPlaceholderFromEnv() throws Exception {
        try (AnnotationConfigApplicationContext ctx = contextWith(Map.of(
                "OFF_USER_ID", "ovafanas@gmail.com",
                "OFF_PASSWORD", ".UtF#W@Ag8Ab4vs"))) {
            Probe probe = ctx.getBean(Probe.class);
            assertEquals("ovafanas@gmail.com", probe.userId,
                    "integration.off.user-id обязан резолвиться из OFF_USER_ID через yml-плейсхолдер");
            assertEquals(".UtF#W@Ag8Ab4vs", probe.password,
                    "Пароль с # и @ должен проходить без искажений");
        }
    }

    @Test
    void withoutEnvBothBindToEmptyDefaults() throws Exception {
        // негативный контроль: нет env-переменных → пустые дефолты → анонимный режим
        try (AnnotationConfigApplicationContext ctx = contextWith(null)) {
            Probe probe = ctx.getBean(Probe.class);
            assertEquals("", probe.userId);
            assertEquals("", probe.password);
        }
    }
}
