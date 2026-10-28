package com.provision.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * FIX (P1, аудит Phase 11): пул потоков для фоновых задач (синхронизация цен).
 * Долгие внешние HTTP-вызовы к провайдерам больше не выполняются в потоке Tomcat
 * внутри БД-транзакции. Фактический путь запуска: {@code IntegrationService#executePriceSync}
 * ({@code @Async}-граница) → {@code PriceSyncService#runPriceSync} (одна выгрузка ЕМИСС →
 * локальная копия → цены привязанных продуктов). Прежняя ссылка на
 * {@code IntegrationService#launchPriceSync} вела на несуществующий метод (KB-3 плана
 * {@code plans/done/2026-10-28-price-sync-lazy-session.md}) — исправлено 29.10.2026.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(5);
        executor.setQueueCapacity(100);
        // "off-sync-" — наследие демонтированного провайдера Open Food Facts (V28);
        // имя потока попадает в логи, поэтому приведено к фактическому источнику.
        executor.setThreadNamePrefix("emis-sync-");
        executor.initialize();
        return executor;
    }
}
