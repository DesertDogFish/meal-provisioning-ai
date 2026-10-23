package com.provision.config;

import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Контрактный фикс P0 (аудит Frontend&lt;-&gt;Backend): все Long ID сериализуются в JSON как строки.
 * Фронтенд использует строковые ID (src/types/index.ts: id: string); числовые Long от бэка
 * ломали строгие сравнения ("1" !== 1) и Map/Set-поиски на клиенте.
 *
 * Примечание: действие глобальное для всех Long-полей ответов (id, categoryId, recipeId, ...).
 * Поля пагинации Spring Page (totalElements/totalPages/number/size) объявлены как primitive long —
 * они НЕ затронуты (примитивы идут через Long.TYPE-сериализатор, который мы не переопределяем),
 * поэтому фронтенд-парсер page.content / page.totalElements не ломается.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer longIdToStringCustomizer() {
        return builder -> {
            builder.serializerByType(Long.class, ToStringSerializer.instance);
            // Long.TYPE НЕ регистрируем сознательно: примитивные long (page metadata) остаются числами.
        };
    }
}
