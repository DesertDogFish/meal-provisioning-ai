package com.provision.service;

import com.provision.dto.integration.IntegrationDto;
import com.provision.dto.integration.SyncLogDto;
import com.provision.entity.Integration;
import com.provision.entity.SyncLog;
import com.provision.entity.User;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.exception.ValidationException;
import com.provision.integration.ConnectionStatus;
import com.provision.integration.PriceProvider;
import com.provision.repository.IntegrationRepository;
import com.provision.repository.SyncLogRepository;
import com.provision.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Карточка интеграции и граница запуска синхронизации.
 *
 * <p>Ответственность сужена намеренно: здесь только подключение/отключение провайдера,
 * запуск фонового синка (с проверкой «уже бежит»), приём файла выгрузки от админа и чтение
 * журнала. Ручной привязки
 * товаров здесь больше нет — продукт связывается с позицией локальной копии ЕМИСС
 * в разделе «Продукты» ({@code ingredients.emis_code}), а сам синк живёт в
 * {@link PriceSyncService}.</p>
 */
@Service
@Slf4j
public class IntegrationService {

    private final Map<String, PriceProvider> providers;
    private final IntegrationRepository integrationRepository;
    private final SyncLogRepository syncLogRepository;
    private final UserRepository userRepository;
    /** Фоновая синхронизация — здесь только граница {@code @Async} (Fix-16, R8/R9). */
    private final PriceSyncService priceSyncService;
    /** Гигиена журнала синков (markRejected при отказе пула — подзадача 15 аудита). */
    private final SyncLogService syncLogService;
    // FIX (P1): self-injection через ObjectProvider — вызов @Async-метода должен идти
    // через прокси Spring, иначе аннотация игнорируется при internal call.
    // ObjectProvider нужен, чтобы unit-тесты конструировали сервис с null-бином.
    private final ObjectProvider<IntegrationService> selfProvider;

    /** Конструктор для unit-тестов: без self-провайдера (синк вызывается синхронно). */
    public IntegrationService(List<PriceProvider> providerList,
                              IntegrationRepository integrationRepository,
                              SyncLogRepository syncLogRepository,
                              UserRepository userRepository,
                              PriceSyncService priceSyncService,
                              SyncLogService syncLogService) {
        this(providerList, integrationRepository, syncLogRepository, userRepository,
                priceSyncService, syncLogService, null);
    }

    @Autowired
    public IntegrationService(List<PriceProvider> providerList,
                              IntegrationRepository integrationRepository,
                              SyncLogRepository syncLogRepository,
                              UserRepository userRepository,
                              PriceSyncService priceSyncService,
                              SyncLogService syncLogService,
                              ObjectProvider<IntegrationService> selfProvider) {
        this.providers = new HashMap<>();
        for (PriceProvider provider : providerList) {
            this.providers.put(provider.code(), provider);
        }
        this.integrationRepository = integrationRepository;
        this.syncLogRepository = syncLogRepository;
        this.userRepository = userRepository;
        this.priceSyncService = priceSyncService;
        this.syncLogService = syncLogService;
        this.selfProvider = selfProvider;
        log.info("Loaded {} price providers: {}", providers.size(), providers.keySet());
    }

    @Transactional(readOnly = true)
    public List<IntegrationDto> getAllIntegrations() {
        return integrationRepository.findAll().stream()
                .map(this::toIntegrationDto)
                .toList();
    }

    @Transactional
    public IntegrationDto connect(String providerCode) {
        PriceProvider provider = providers.get(providerCode);
        if (provider == null) {
            throw new NotFoundException("Provider not found: " + providerCode);
        }

        ConnectionStatus status = provider.testConnection();

        Integration integration = integrationRepository.findByProvider(providerCode)
                .orElseGet(() -> Integration.builder()
                        .provider(providerCode)
                        .status("DISCONNECTED")
                        .build());

        integration.setStatus(status.available() ? "CONNECTED" : "ERROR");
        // FIX (баг «Ошибка: Connected successfully»): поле error_message семантически — текст
        // ошибки, и UI выводит его красным блоком на карточке интеграции, поэтому при
        // успешном подключении errorMessage должен быть очищен (null).
        integration.setErrorMessage(status.available() ? null : status.message());
        integration.setLastConnectedAt(status.available() ? LocalDateTime.now() : null);

        integration = integrationRepository.save(integration);
        log.info("Integration {} status: {}", providerCode, integration.getStatus());

        return toIntegrationDto(integration);
    }

    @Transactional
    public IntegrationDto disconnect(String providerCode) {
        Integration integration = integrationRepository.findByProvider(providerCode)
                .orElseThrow(() -> new NotFoundException("Integration not found: " + providerCode));

        integration.setStatus("DISCONNECTED");
        integration.setLastConnectedAt(null);
        integration.setErrorMessage(null);

        integration = integrationRepository.save(integration);
        log.info("Integration {} disconnected", providerCode);

        return toIntegrationDto(integration);
    }

    /**
     * FIX (P1, аудит Phase 11): синхронизация — фоновая.
     * Проверка провайдера/конкурентности и создание SyncLog(RUNNING) выполняются в потоке
     * запроса; тяжёлая выгрузка ЕМИСС уходит в пул через {@code @Async}-прокси (self via
     * ObjectProvider — иначе internal call обошёл бы прокси Spring и аннотация не сработала).
     * Контроллер отвечает 202 ACCEPTED + logId: прогресс виден в /sync-logs.
     */
    public SyncLog syncPrices(String providerCode, Long userId) {
        Integration integration = integrationRepository.findByProvider(providerCode)
                .orElseThrow(() -> new NotFoundException("Integration not found: " + providerCode));

        if (!"CONNECTED".equals(integration.getStatus())) {
            throw new ConflictException("INTEGRATION_DISCONNECTED: Provider is not connected");
        }

        SyncLog syncLog = startSyncLog(providerCode, userId);
        dispatch(() -> self().executePriceSync(providerCode, syncLog.getId()),
                syncLog.getId(), providerCode);

        return syncLog;
    }

    /**
     * Загрузка выгрузки ЕМИСС файлом (Запуск №17: «чтобы я мог в интеграциях прогрузить файл
     * сам»). Админ скачивает SDMX с портала вручную — браузером, под своей сессией, без нашего
     * анти-бота — и кладёт его в локальную копию тем же конвейером, что и кнопка
     * «Синхронизировать»: справочник + цены за два последних года + применение к привязанным
     * продуктам.
     *
     * <p>Отличие от {@link #syncPrices}: статус {@code CONNECTED} НЕ требуется. Файл и есть
     * план Б на случай, когда портал недоступен (403 анти-бота, 503 троттлинга), и требовать
     * для него успешного подключения — значит оставить админа без единственного рабочего пути.</p>
     *
     * @param payload  байты файла (предел размера проверяет провайдер: {@code max-response-bytes})
     * @param fileName исходное имя файла — уходит в журнал синка
     */
    public SyncLog uploadSnapshot(String providerCode, Long userId, byte[] payload, String fileName) {
        if (!providers.containsKey(providerCode)) {
            throw new NotFoundException("Provider not found: " + providerCode);
        }
        if (payload == null || payload.length == 0) {
            throw new ValidationException("EMPTY_FILE: Файл выгрузки пуст");
        }

        SyncLog syncLog = startSyncLog(providerCode, userId);
        log.info("ЕМИСС: загрузка файла «{}» ({} байт) запущена как синк {} провайдера {}",
                fileName, payload.length, syncLog.getId(), providerCode);
        dispatch(() -> self().executeUploadSync(providerCode, syncLog.getId(), payload, fileName),
                syncLog.getId(), providerCode);

        return syncLog;
    }

    /**
     * Отправка фоновой задачи в пул с явной обработкой отказа (аудит 29.10.2026,
     * подзадача 15). Пул использует {@code AbortPolicy}: если воркеры заняты и очередь
     * полна, задача отклоняется СРАЗУ, а SyncLog не остаётся висеть в RUNNING — помечаем
     * его FAILED с причиной и отвечаем 409 (клиент повторяет позже, прогресс виден в журнале).
     */
    private void dispatch(Runnable asyncCall, Long syncLogId, String providerCode) {
        try {
            asyncCall.run();
        } catch (java.util.concurrent.RejectedExecutionException e) {
            log.error("Sync {} rejected by executor (pool/queue saturated): {}", syncLogId, e.getMessage());
            syncLogService.markRejected(syncLogId, "EXECUTOR_SATURATED: пул синхронизации перегружен");
            throw new ConflictException("EXECUTOR_SATURATED: Sync executor is saturated, retry later");
        }
    }

    /**
     * Общая часть запуска: проверка «уже бежит» + запись журнала в статусе RUNNING.
     * Выполняется в потоке запроса (до {@code @Async}), чтобы конкурентный запуск получил
     * 409 сразу, а не «где-то в фоне».
     */
    private SyncLog startSyncLog(String providerCode, Long userId) {
        Optional<SyncLog> runningSync = syncLogRepository.findRunningByProvider(providerCode);
        if (runningSync.isPresent()) {
            throw new ConflictException(
                    "SYNC_ALREADY_RUNNING: Sync is already running for provider " + providerCode);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        return syncLogRepository.save(SyncLog.builder()
                .provider(providerCode)
                .type("PRICES")
                .status("RUNNING")
                .triggeredBy("MANUAL")
                .triggeredUser(user)
                .startedAt(LocalDateTime.now())
                .createdCount(0)
                .updatedCount(0)
                .errorCount(0)
                .build());
    }

    /** Прокси Spring для {@code @Async}-методов (internal call обошёл бы прокси). */
    private IntegrationService self() {
        return selfProvider != null ? selfProvider.getObject() : this;
    }

    /**
     * Фоновая часть синхронизации: вне HTTP-потока и вне БД-транзакции, исключения наружу
     * не выпрыгивают — статус и детали пишутся в SyncLog ({@link PriceSyncService}).
     */
    @Async("taskExecutor")
    public void executePriceSync(String providerCode, Long syncLogId) {
        priceSyncService.runPriceSync(providerCode, syncLogId);
    }

    /** Фоновая часть загрузки файла: тот же конвейер, только слепок разбирается из байтов. */
    @Async("taskExecutor")
    public void executeUploadSync(String providerCode, Long syncLogId, byte[] payload, String fileName) {
        priceSyncService.runPriceSyncFromFile(providerCode, syncLogId, payload, fileName);
    }

    @Transactional(readOnly = true)
    public List<SyncLogDto> getSyncLogs(String providerCode) {
        List<SyncLog> logs = providerCode != null
                ? syncLogRepository.findByProviderOrderByStartedAtDesc(providerCode)
                : syncLogRepository.findAllByOrderByStartedAtDesc();
        return logs.stream()
                .map(this::toSyncLogDto)
                .toList();
    }

    private IntegrationDto toIntegrationDto(Integration integration) {
        return new IntegrationDto(
                integration.getId(),
                integration.getProvider(),
                integration.getStatus(),
                integration.getBaseUrl(),
                integration.getLastConnectedAt(),
                integration.getLastSyncAt(),
                integration.getErrorMessage()
        );
    }

    private SyncLogDto toSyncLogDto(SyncLog syncLog) {
        return new SyncLogDto(
                syncLog.getId(),
                syncLog.getProvider(),
                syncLog.getType(),
                syncLog.getStatus(),
                syncLog.getStartedAt(),
                syncLog.getFinishedAt(),
                syncLog.getCreatedCount(),
                syncLog.getUpdatedCount(),
                syncLog.getErrorCount()
        );
    }
}
