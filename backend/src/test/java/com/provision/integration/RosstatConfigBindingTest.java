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
 * Fix-13: страж биндинга конфигурации ЕМИСС/Росстата — наследник
 * OffConfigBindingTest (тот сторожил ловушку YAML-boolean ключа "off").
 *
 * Воспроизводит цепочку как в рантайме: РЕАЛЬНЫЙ application.yml (classpath)
 * → плейсхолдеры ${ROSSTAT_*} → свойства integration.rosstat.* → @Value-поля
 * с теми же выражениями, что у RosstatEmisProvider.
 */
@DisplayName("application.yml: биндинг integration.rosstat (Fix-13)")
class RosstatConfigBindingTest {

    /** Зонд с теми же @Value-выражениями, что у RosstatEmisProvider. */
    static class Probe {
        @Value("${integration.rosstat.base-url:}")
        String baseUrl;
        @Value("${integration.rosstat.indicator-id:}")
        String indicatorId;
        @Value("${integration.rosstat.region:}")
        String region;
        @Value("${integration.rosstat.cache-hours:0}")
        long cacheHours;
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
    @DisplayName("Дефолты без env: fedstat.ru, показатель 31448, РФ, кэш 24ч, UA с контактом")
    void defaults() throws Exception {
        try (var ctx = contextWith(null)) {
            Probe p = ctx.getBean(Probe.class);
            assertEquals("https://www.fedstat.ru", p.baseUrl);
            assertEquals("31448", p.indicatorId);
            assertEquals("Российская Федерация", p.region);
            assertEquals(24, p.cacheHours);
            // spring.application.name из yml = "provision", app.version дефолтный 0.0.0
            assertTrue(p.userAgent.contains("provision/0.0.0"), "UA: " + p.userAgent);
            assertTrue(p.userAgent.contains("dev@provision.app"), "UA должен содержать контакт: " + p.userAgent);
        }
    }

    @Test
    @DisplayName("Env-переопределения доезжают до @Value (ROSSTAT_* и INTEGRATION_CONTACT_EMAIL)")
    void envOverrides() throws Exception {
        try (var ctx = contextWith(Map.of(
                "ROSSTAT_INDICATOR_ID", "37426",
                "ROSSTAT_REGION", "Белгородская область",
                "ROSSTAT_CACHE_HOURS", "6",
                "INTEGRATION_CONTACT_EMAIL", "oleg@example.com"))) {
            Probe p = ctx.getBean(Probe.class);
            assertEquals("37426", p.indicatorId);
            assertEquals("Белгородская область", p.region);
            assertEquals(6, p.cacheHours);
            assertTrue(p.userAgent.contains("oleg@example.com"), "UA: " + p.userAgent);
        }
    }

    @Test
    @DisplayName("Регресс-страж: блок integration.off демонтирован вместе с OFF-провайдером")
    void offBlockIsGone() throws Exception {
        try (var ctx = contextWith(null)) {
            // Ключ rosstat обязан биндиться как вложенная карта (не как скаляр/boolean —
            // ловушка YAML 1.1, из-за которой «off» когда-то стал integration[false].*)
            assertNotNull(ctx.getEnvironment().getProperty("integration.rosstat.base-url"));
            assertNull(ctx.getEnvironment().getProperty("integration.off.user-id"),
                    "OFF-конфиг должен быть удалён из application.yml");
            assertNull(ctx.getEnvironment().getProperty("integration[false].user-id"));
        }
    }
}
