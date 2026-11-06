package com.provision;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring Boot 4 auto-configures Jackson 3 ({@code tools.jackson.*}), so the Jackson 2
 * {@link ObjectMapper} that many integration tests (and {@code TestUsers}) inject is no
 * longer a bean. Register it explicitly for the test context.
 *
 * Test-classpath only: this class lives in {@code src/test/java} and is picked up by the
 * component scan of the {@code com.provision} package during {@code @SpringBootTest}.
 */
@Configuration
public class TestJacksonConfig {

    @Bean
    public ObjectMapper jackson2ObjectMapper() {
        return new ObjectMapper().findAndRegisterModules();
    }
}
