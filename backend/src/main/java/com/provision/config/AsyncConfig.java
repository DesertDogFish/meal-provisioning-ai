package com.provision.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * FIX (P1, аудит Phase 11): пул потоков для фоновых задач (синхронизация цен).
 * Долгие внешние HTTP-вызовы к провайдерам больше не выполняются в потоке Tomcat
 * внутри БД-транзакции (см. IntegrationService#launchPriceSync).
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
        executor.setThreadNamePrefix("off-sync-");
        executor.initialize();
        return executor;
    }
}
