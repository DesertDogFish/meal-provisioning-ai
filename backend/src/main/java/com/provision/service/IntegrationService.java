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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
     * <p>AU-05 (внешний аудит 30.10.2026): файл приходит {@link Path}, а не {@code byte[]},
     * и guard «уже бежит» вызывается ДО чтения тела (см. {@link #assertUploadCanStart}).
     * Раньше контроллер материализовывал все 96 МБ в heap и только потом узнавал, что синк
     * уже идёт, — память потрачена, а ответ всё равно 409.</p>
     *
     * <p>Владение временным файлом: после успешного входа в метод его удаляет
     * {@link PriceSyncService#runPriceSyncFromFile} (в {@code finally} фонового задания).
     * Если старт не состоялся (пустой файл, провайдер не найден, уже бежит, пул насыщен) —
     * файл удаляет этот метод, иначе временные копии копились бы на диске.</p>
     *
     * @param payloadFile путь к файлу во временном каталоге (содержимое уже на диске)
     * @param sizeBytes   размер файла — для журнала и проверки «пуст»
     * @param fileName    исходное имя файла — уходит в журнал синка
     */
    public SyncLog uploadSnapshot(String providerCode, Long userId,
                                  Path payloadFile, long sizeBytes, String fileName) {
        if (!providers.containsKey(providerCode)) {
            deletePayload(payloadFile, "провайдер не найден");
            throw new NotFoundException("Provider not found: " + providerCode);
        }
        if (payloadFile == null || sizeBytes <= 0) {
            deletePayload(payloadFile, "файл пуст");
            throw new ValidationException("EMPTY_FILE: Файл выгрузки пуст");
        }

        SyncLog syncLog;
        try {
            syncLog = startSyncLog(providerCode, userId);
        } catch (RuntimeException e) {
            deletePayload(payloadFile, "синк не стартовал: " + e.getMessage());
            throw e;
        }
        log.info("ЕМИСС: загрузка файла «{}» ({} байт) запущена как синк {} провайдера {}",
                fileName, sizeBytes, syncLog.getId(), providerCode);
        try {
            dispatch(() -> self().executeUploadSync(providerCode, syncLog.getId(), payloadFile, fileName),
                    syncLog.getId(), providerCode);
        } catch (RuntimeException e) {
            // Пул насыщен (AbortPolicy → 409): фоновое задание не стартовало, значит файл
            // удалять некому, кроме нас.
            deletePayload(payloadFile, "executor отклонил задачу");
            throw e;
        }

        return syncLog;
    }

    /**
     * Проверка «загрузку можно начинать» БЕЗ чтения тела файла (AU-05).
     *
     * <p>Вызывается контроллером до {@code MultipartFile.transferTo}, чтобы отказ
     * «провайдер не найден» / «синк уже бежит» не стоил 96 МБ на диске и в heap.
     * Проверка совещательная: источником истины остаётся частичный уникальный индекс
     * {@code uq_sync_logs_running} (V31), который ловит гонку в {@link #startSyncLog}.</p>
     */
    public void assertUploadCanStart(String providerCode) {
        if (!providers.containsKey(providerCode)) {
            throw new NotFoundException("Provider not found: " + providerCode);
        }
        Optional<SyncLog> running = syncLogRepository.findRunningByProvider(providerCode);
        if (running.isPresent()) {
            throw new ConflictException(
                    "SYNC_ALREADY_RUNNING: Sync is already running for provider " + providerCode);
        }
    }

    /** Удалить временный файл при отказе старта; причина отказа уже в логе вызывающего. */
    private void deletePayload(Path payloadFile, String reason) {
        if (payloadFile == null) {
            return;
        }
        try {
            Files.deleteIfExists(payloadFile);
            log.debug("ЕМИСС: временный файл {} удалён ({})", payloadFile, reason);
        } catch (IOException | RuntimeException e) {
            log.warn("ЕМИСС: не удалось удалить временный файл {} ({}): {}", payloadFile, reason, e.getMessage());
        }
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
     *
     * <p><b>FIX (внешний аудит 30.10.2026, AU-03).</b> Прежняя пара
     * «SELECT status='RUNNING' → INSERT» была гонкой check-then-act: между запросами
     * второй поток успевал пройти ту же проверку, и два одновременных запуска давали
     * два SyncLog(RUNNING) плюс два параллельных {@code PriceSyncService.runPriceSync}
     * (гонка записи в {@code emis_prices}/{@code ingredient_prices} и недетерминированные
     * счётчики журнала). В схеме были только неуникальные индексы, поэтому БД конфликт
     * не ловила.</p>
     *
     * <p>Теперь источник истины — частичный уникальный индекс
     * {@code uq_sync_logs_running ON sync_logs(provider) WHERE status='RUNNING'}
     * (миграция V31). SELECT оставлен как быстрый путь: он даёт внятный 409 в штатном
     * случае и не тратит INSERT на очевидный отказ. Если же гонка всё-таки случилась,
     * проигравший поток упирается в индекс, и мы приводим {@code DataIntegrityViolationException}
     * к тому же 409 {@code SYNC_ALREADY_RUNNING} — контракт для клиента не меняется,
     * а второй параллельный синк становится невозможен на уровне БД.</p>
     */
    private SyncLog startSyncLog(String providerCode, Long userId) {
        Optional<SyncLog> runningSync = syncLogRepository.findRunningByProvider(providerCode);
        if (runningSync.isPresent()) {
            throw new ConflictException(
                    "SYNC_ALREADY_RUNNING: Sync is already running for provider " + providerCode);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        try {
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
        } catch (DataIntegrityViolationException e) {
            // Единственная уникальность на sync_logs — uq_sync_logs_running (V31),
            // поэтому причина однозначна: конкурент успел создать RUNNING раньше нас.
            log.warn("Sync start lost the race for provider {}: unique RUNNING index rejected "
                    + "the insert ({})", providerCode, e.getMostSpecificCause().getMessage());
            throw new ConflictException(
                    "SYNC_ALREADY_RUNNING: Sync is already running for provider " + providerCode);
        }
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

    /**
     * Фоновая часть загрузки файла: тот же конвейер, только слепок разбирается с диска
     * потоком (AU-05 — файл не копируется в heap).
     */
    @Async("taskExecutor")
    public void executeUploadSync(String providerCode, Long syncLogId,
                                  Path payloadFile, String fileName) {
        priceSyncService.runPriceSyncFromFile(providerCode, syncLogId, payloadFile, fileName);
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
