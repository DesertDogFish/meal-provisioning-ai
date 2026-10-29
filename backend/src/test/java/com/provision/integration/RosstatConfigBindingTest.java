package com.provision.integration;

import org.junit.jupiter.api.DisplayName;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Страж биндинга конфигурации ЕМИСС/Росстата.
 *
 * Воспроизводит цепочку как в рантайме: РЕАЛЬНЫЙ application.yml (classpath)
 * → плейсхолдеры ${ROSSTAT_*} → свойства integration.rosstat.* → @Value-поля
 * с теми же выражениями, что у RosstatEmisProvider.
 */
@DisplayName("application.yml: биндинг integration.rosstat (Fix-13)")
class RosstatConfigBindingTest {

    /** Зонд с теми же @Value-выражениями, что у RosstatEmisProvider и сервисов копии. */
    static class Probe {
        @Value("${integration.rosstat.base-url:}")
        String baseUrl;
        @Value("${integration.rosstat.indicator-id:}")
        String indicatorId;
        @Value("${integration.rosstat.region:}")
        String region;
        @Value("${integration.rosstat.region-code:}")
        String regionCode;
        @Value("${integration.rosstat.period-years:0}")
        int periodYears;
        @Value("${integration.rosstat.period-months:-1}")
        int periodMonths;
        @Value("${integration.rosstat.max-response-bytes:0}")
        long maxResponseBytes;
        @Value("${integration.rosstat.user-agent:}")
        String userAgent;
    }

    private AnnotationConfigApplicationContext contextWith(Map<String, Object> envLike) throws Exception {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        if (envLike != null) {
            ctx.getEnvironment().getPropertySources().addFirst(
                    new MapPropertySource("envSim", envLike));
        }
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
    @DisplayName("Дефолты без env: fedstat.ru, показатель 31448, регион 643004.АГ, окно 2 года, все месяцы")
    void defaults() throws Exception {
        try (var ctx = contextWith(null)) {
            Probe p = ctx.getBean(Probe.class);
            assertEquals("https://www.fedstat.ru", p.baseUrl);
            assertEquals("31448", p.indicatorId);
            // Решение владельца: только «РФ без учета новых субъектов (с 01.01.2023)», не «643».
            assertEquals("Российская Федерация без учета новых субъектов (с 01.01.2023)", p.region);
            assertEquals("643004.АГ", p.regionCode);
            assertEquals(2, p.periodYears);
            assertEquals(0, p.periodMonths);
            // 96 МБ: с потоковым разбором (KB-1) лимит больше не спасает heap — он держит
            // runaway-ответ, а полный ряд ЕМИСС (65 МБ) обязан проходить.
            assertEquals(100_663_296L, p.maxResponseBytes);
            // spring.application.name из yml = «provision», версия — из pom.xml: Maven-фильтрация
            // ресурсов подставляет @project.version@ в app.version (KB-4: раньше свойства не было
            // и UA всегда говорил «0.0.0»). Проверяем форму, а не конкретную цифру, чтобы bump
            // версии в pom не требовал правки теста.
            assertTrue(p.userAgent.matches("(?s).*provision/\\d+\\.\\d+\\.\\d+.*"), "UA: " + p.userAgent);
            assertTrue(p.userAgent.contains("dev@provision.app"), "UA должен содержать контакт: " + p.userAgent);
        }
    }

    @Test
    @DisplayName("Env-переопределения доезжают до @Value (ROSSTAT_* и INTEGRATION_CONTACT_EMAIL)")
    void envOverrides() throws Exception {
        try (var ctx = contextWith(Map.of(
                "ROSSTAT_INDICATOR_ID", "37426",
                "ROSSTAT_REGION", "Белгородская область",
                "ROSSTAT_REGION_CODE", "14000000000",
                "ROSSTAT_PERIOD_YEARS", "3",
                "ROSSTAT_PERIOD_MONTHS", "6",
                "INTEGRATION_CONTACT_EMAIL", "oleg@example.com"))) {
            Probe p = ctx.getBean(Probe.class);
            assertEquals("37426", p.indicatorId);
            assertEquals("Белгородская область", p.region);
            assertEquals("14000000000", p.regionCode);
            assertEquals(3, p.periodYears);
            assertEquals(6, p.periodMonths);
            assertTrue(p.userAgent.contains("oleg@example.com"), "UA: " + p.userAgent);
        }
    }

    @Test
    @DisplayName("Регресс-страж: integration.rosstat биндится вложенной картой (ловушка YAML 1.1)")
    void rosstatBlockIsNestedMap() throws Exception {
        try (var ctx = contextWith(null)) {
            // Ключ rosstat обязан биндиться как вложенная карта, а не как скаляр/boolean:
            // в YAML 1.1 «off»/«on» парсятся в false/true, и блок когда-то превратился
            // в integration[false].* — свойства перестали доезжать до @Value.
            assertNotNull(ctx.getEnvironment().getProperty("integration.rosstat.base-url"));
            assertNotNull(ctx.getEnvironment().getProperty("integration.rosstat.region-code"));
            assertNull(ctx.getEnvironment().getProperty("integration[false].user-id"));
        }
    }
}
