package com.provision.config;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * FIX (P1, аудит Phase 11): пул потоков для фоновых задач (синхронизация цен).
 * Долгие внешние HTTP-вызовы к провайдерам больше не выполняются в потоке Tomcat
 * внутри БД-транзакции. Фактический путь запуска: {@code IntegrationService#executePriceSync}
 * ({@code @Async}-граница) → {@code PriceSyncService#runPriceSync} (одна выгрузка ЕМИСС →
 * локальная копия → цены привязанных продуктов). Прежняя ссылка на
 * {@code IntegrationService#launchPriceSync} вела на несуществующий метод (KB-3 плана
 * {@code plans/done/2026-10-28-price-sync-lazy-session.md}) — исправлено 29.10.2026.
 *
 * FIX (аудит 29.10.2026, подзадача 15, plans/done/2026-10-29-full-audit.md):
 * <ul>
 *   <li>явная rejection-политика {@code AbortPolicy}: при полном пуле и очереди задача
 *       отклоняется сразу (RejectedExecutionException), а не копится невидимо.
 *       {@code CallerRunsPolicy} НЕ подходит: синк — это минуты внешнего HTTP, выполнять
 *       его в потоке Tomcat значит держать запрос заложником. Отклонение перехватывает
 *       {@code IntegrationService} и превращает в 409 SYNC_QUEUE_FULL + FAILED в журнале;</li>
 *   <li>{@code keepAliveSeconds=60} + {@code allowCoreThreadTimeOut}: ядра пула остывают
 *       между редкими синками — поток не держится вечно;</li>
 *   <li>{@code TaskDecorator} проносит MDC (traceId из {@link TraceIdFilter}) в фоновый
 *       поток — логи синка читаются вместе с запросом, который его запустил (R10);</li>
 *   <li>{@code AsyncUncaughtExceptionHandler}: исключения {@code @Async void}-методов
 *       больше не теряются в дефолтном SimpleAsyncUncaughtExceptionHandler-пути без контекста.</li>
 * </ul>
 */
@Configuration
@EnableAsync
@Slf4j
public class AsyncConfig implements AsyncConfigurer {

    @Bean(name = "taskExecutor")
    public ThreadPoolTaskExecutor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(5);
        // AU-05 (внешний аудит 30.10.2026): было 100. Очередь такой глубины для пула ТЯЖЁЛЫХ
        // синхронизаций бессмысленна и опасна: задача ждёт минуты, админ не видит причины
        // (в журнале уже RUNNING), а каждая отложенная задача удерживает временный файл
        // выгрузки (~65 МБ на диске) и запись журнала. При отказе AbortPolicy даёт честный
        // 409 EXECUTOR_SATURATED («повторите позже»), поэтому глубина 2 — это «сейчас + один
        // следующий», а не склад.
        executor.setQueueCapacity(2);
        // "off-sync-" — наследие демонтированного провайдера Open Food Facts (V28);
        // имя потока попадает в логи, поэтому приведено к фактическому источнику.
        executor.setThreadNamePrefix("emis-sync-");
        executor.setKeepAliveSeconds(60);
        executor.setAllowCoreThreadTimeOut(true);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setTaskDecorator(mdcTaskDecorator());
        executor.initialize();
        return executor;
    }

    /** Копирует MDC вызывающего потока в фоновый (и восстанавливает прежнее состояние после). */
    static TaskDecorator mdcTaskDecorator() {
        return runnable -> {
            Map<String, String> callerContext = MDC.getCopyOfContextMap();
            return () -> {
                Map<String, String> previous = MDC.getCopyOfContextMap();
                if (callerContext != null) {
                    MDC.setContextMap(callerContext);
                } else {
                    MDC.clear();
                }
                try {
                    runnable.run();
                } finally {
                    if (previous != null) {
                        MDC.setContextMap(previous);
                    } else {
                        MDC.clear();
                    }
                }
            };
        };
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) -> log.error(
                "Unhandled exception in @Async {}.{}: {}",
                method.getDeclaringClass().getSimpleName(), method.getName(), ex.getMessage(), ex);
    }

    /** Executor для {@code @Async} без имени — тот же пул (иначе Spring заведёт свой SimpleAsyncTaskExecutor). */
    @Override
    public Executor getAsyncExecutor() {
        return taskExecutor();
    }
}
