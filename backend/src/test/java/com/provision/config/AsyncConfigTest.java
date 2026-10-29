package com.provision.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * AU-05 (внешний аудит 30.10.2026): глубина очереди пула фоновых синхронизаций.
 *
 * <p>Было {@code queueCapacity=100} — склад для задач, каждая из которых держит временный
 * файл выгрузки (~65 МБ на диске) и запись журнала в статусе RUNNING, пока админ уже минуты
 * смотрит в пустой drawer. Стало 2 («сейчас + один следующий»): дальше {@code AbortPolicy}
 * отклоняет задачу, {@code IntegrationService.dispatch} превращает отказ в 409
 * {@code EXECUTOR_SATURATED} и помечает SyncLog FAILED — см. {@code IntegrationUploadTest}.</p>
 *
 * <p>Проверяем конфигурацию, а не Spring-контекст (R2): {@code taskExecutor()} — обычный
 * фабричный метод, executor конструируется напрямую и гасится в тесте.</p>
 */
@DisplayName("AsyncConfig: пул синхронизаций — очередь на 2 задачи и честный отказ при насыщении")
class AsyncConfigTest {

    private static ThreadPoolTaskExecutor newExecutor() {
        return new AsyncConfig().taskExecutor();
    }

    @Test
    @DisplayName("очередь глубиной 2, AbortPolicy, ядра остывают — регресс против «склада на 100 задач»")
    void poolIsShallowAndAbortsInsteadOfHoarding() {
        ThreadPoolTaskExecutor executor = newExecutor();
        try {
            assertThat(executor.getCorePoolSize()).isEqualTo(2);
            assertThat(executor.getMaxPoolSize()).isEqualTo(5);
            // Глубина очереди видна по свободным местам: 2 — это AU-05, 100 было до правки.
            assertThat(executor.getThreadPoolExecutor().getQueue().remainingCapacity()).isEqualTo(2);
            assertThat(executor.getThreadPoolExecutor().getRejectedExecutionHandler())
                    .isInstanceOf(ThreadPoolExecutor.AbortPolicy.class);
            assertThat(executor.getThreadNamePrefix()).isEqualTo("emis-sync-");
        } finally {
            executor.shutdown();
        }
    }

    @Test
    @DisplayName("насыщенный пул отклоняет задачу сразу: 2 в работе + 2 в очереди + 3 до max, 8-я — RejectedExecutionException")
    void rejectsTaskOnceWorkersAndQueueAreFull() throws InterruptedException {
        ThreadPoolTaskExecutor executor = newExecutor();
        CountDownLatch gate = new CountDownLatch(1);
        CountDownLatch started = new CountDownLatch(5);
        List<Runnable> accepted = new ArrayList<>();
        try {
            // 7 задач помещается: 2 ядра + 2 в очереди + 3 потока до maxPoolSize=5.
            for (int i = 0; i < 7; i++) {
                Runnable blocking = () -> {
                    started.countDown();
                    try {
                        gate.await(10, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                };
                executor.execute(blocking);
                accepted.add(blocking);
            }
            assertThat(started.await(5, TimeUnit.SECONDS))
                    .as("все 5 воркеров заняты — очередь полна, расти пулу некуда")
                    .isTrue();
            assertThat(executor.getThreadPoolExecutor().getQueue().size()).isEqualTo(2);

            assertThatThrownBy(() -> executor.execute(() -> { }))
                    .isInstanceOf(RejectedExecutionException.class);
        } finally {
            gate.countDown();
            executor.shutdown();
            assertThat(awaitTermination(executor)).isTrue();
            assertThat(accepted).hasSize(7);
        }
    }

    private static boolean awaitTermination(ThreadPoolTaskExecutor executor) {
        try {
            return executor.getThreadPoolExecutor().awaitTermination(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
