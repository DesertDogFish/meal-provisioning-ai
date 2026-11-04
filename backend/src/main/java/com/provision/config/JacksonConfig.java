package com.provision.config;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.module.SimpleModule;
import tools.jackson.databind.ser.std.ToStringSerializer;

/**
 * Контрактный фикс P0 (аудит Frontend<->Backend): все Long ID сериализуются в JSON как строки.
 * ...
 */
@Configuration
public class JacksonConfig {

    @Bean
    public JsonMapperBuilderCustomizer longIdToStringCustomizer() {
        return (JsonMapper.Builder builder) -> {
            SimpleModule module = new SimpleModule("longIdToString");
            module.addSerializer(Long.class, ToStringSerializer.instance);
            builder.addModule(module);
            // Long.TYPE НЕ регистрируем сознательно: примитивные long (page metadata) остаются числами.
        };
    }
}