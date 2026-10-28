package com.provision.service;

import com.provision.dto.integration.IngredientBindingDto;
import com.provision.dto.integration.IntegrationDto;
import com.provision.dto.integration.IngredientMappingRequest;
import com.provision.dto.integration.SyncLogDto;
import com.provision.entity.*;
import com.provision.exception.NotFoundException;
import com.provision.integration.*;
import com.provision.repository.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@Slf4j
public class IntegrationService {

    private final Map<String, PriceProvider> providers;
    private final IntegrationRepository integrationRepository;
    private final ExternalProductRepository externalProductRepository;
    private final IngredientMappingRepository mappingRepository;
    private final IngredientRepository ingredientRepository;
    private final SyncLogRepository syncLogRepository;
    private final UserRepository userRepository;
    /** Fix-16: фоновая синхронизация цен — здесь только граница {@code @Async} (R8/R9). */
    private final PriceSyncService priceSyncService;
    // FIX (P1): self-injection через ObjectProvider — вызов @Async-метода должен идти
    // через прокси Spring, иначе аннотация игнорируется при internal call.
    // ObjectProvider нужен, чтобы unit-тесты конструировали сервис с null-бином.
    private final org.springframework.beans.factory.ObjectProvider<IntegrationService> selfProvider;

    public IntegrationService(
            List<PriceProvider> providerList,
            IntegrationRepository integrationRepository,
            ExternalProductRepository externalProductRepository,
            IngredientMappingRepository mappingRepository,
            IngredientRepository ingredientRepository,
            SyncLogRepository syncLogRepository,
            UserRepository userRepository,
            PriceSyncService priceSyncService) {
        this(providerList, integrationRepository, externalProductRepository, mappingRepository,
                ingredientRepository, syncLogRepository, userRepository, priceSyncService, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public IntegrationService(
            List<PriceProvider> providerList,
            IntegrationRepository integrationRepository,
            ExternalProductRepository externalProductRepository,
            IngredientMappingRepository mappingRepository,
            IngredientRepository ingredientRepository,
            SyncLogRepository syncLogRepository,
            UserRepository userRepository,
            PriceSyncService priceSyncService,
            org.springframework.beans.factory.ObjectProvider<IntegrationService> selfProvider) {
        this.providers = new HashMap<>();
        for (PriceProvider provider : providerList) {
            this.providers.put(provider.code(), provider);
        }
        this.integrationRepository = integrationRepository;
        this.externalProductRepository = externalProductRepository;
        this.mappingRepository = mappingRepository;
        this.ingredientRepository = ingredientRepository;
        this.syncLogRepository = syncLogRepository;
        this.userRepository = userRepository;
        this.priceSyncService = priceSyncService;
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
        // FIX (баг «Ошибка: Connected successfully»): раньше сюда писалось
        // status.message() даже при успехе ("Connected successfully" из
        // ConnectionStatus.success()). Поле error_message семантически — текст
        // ошибки, и UI выводит его красным блоком на карточке интеграции, поэтому
        // при успешном подключении errorMessage должен быть очищен (null).
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

    @Transactional(readOnly = true)
    public List<ExternalProductDto> searchProducts(String providerCode, String query, int limit) {
        Integration integration = integrationRepository.findByProvider(providerCode)
                .orElseThrow(() -> new NotFoundException("Integration not found: " + providerCode));

        if (!"CONNECTED".equals(integration.getStatus())) {
            throw new IllegalStateException("Provider is not connected");
        }

        PriceProvider provider = providers.get(providerCode);
        return provider.searchProducts(query, limit);
    }

    @Transactional
    public IngredientBindingDto createMapping(Long ingredientId, IngredientMappingRequest request) {
        Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new NotFoundException("Ingredient not found: " + ingredientId));

        RecipeSource source = parseProviderSource(request.provider());

        // Получаем или создаём внешний продукт
        ExternalProduct externalProduct = externalProductRepository
                .findByProviderAndExternalCode(request.provider(), request.externalCode())
                .orElseGet(() -> {
                    ExternalProduct newProduct = ExternalProduct.builder()
                            .provider(request.provider())
                            .externalCode(request.externalCode())
                            .name(ingredient.getName())
                            .packAmount(request.packAmount())
                            .packUnit(request.packUnit())
                            .build();
                    return externalProductRepository.save(newProduct);
                });

        // Fix-14: идемпотентный upsert вместо «Mapping already exists».
        // Раньше повторная привязка того же ингредиента (замена товара, повторный
        // клик, попытка перепривязать после неочевидного успеха) падала с
        // IllegalStateException, а пользователь не видел, ЧТО уже привязано, и не
        // мог это изменить. Теперь существующий маппинг (ingredientId, source)
        // просто переводится на новый внешний товар.
        IngredientMapping mapping = mappingRepository
                .findByInternalIngredientIdAndSource(ingredientId, source)
                .orElse(null);
        boolean isNew = mapping == null;
        if (isNew) {
            mapping = IngredientMapping.builder()
                    .source(source)
                    .internalIngredient(ingredient)
                    .build();
        }
        mapping.setExternalName(ingredient.getName());
        mapping.setExternalCode(request.externalCode());
        mapping.setExternalProduct(externalProduct);

        // Fix-15: save() без переприсваивания — JPA (IDENTITY) проставляет id и
        // createdAt (@PrePersist) на том же экземпляре, а мок-repository в тестах
        // возвращает null (переприсваивание роняло toBindingDto NPE).
        mappingRepository.save(mapping);
        log.info("{} mapping for ingredient {} to external product {}",
                isNew ? "Created" : "Updated", ingredientId, request.externalCode());
        // Fix-15: отвечаем готовой привязкой (200 + тело). Раньше контроллер
        // возвращал ПУСТОЙ 200 — фронтенд response.json() падал с
        // «Failed to execute 'json' … Unexpected end of JSON input», хотя
        // маппинг фактически создавался (боль п.1/п.4 сообщения владельца).
        return toBindingDto(mapping);
    }

    /**
     * Fix-14: список текущих привязок провайдера (для UI «Текущие привязки»,
     * чтобы админ видел, что уже связано, и мог перепривязать/отвязать).
     * Для провайдера, не являющегося источником рецептов, — пустой список.
     */
    @Transactional(readOnly = true)
    public List<IngredientBindingDto> getMappings(String providerCode) {
        // Fix-16: код провайдера → RecipeSource парсит PriceSyncService (одно место
        // на обе выборки маппингов: «Текущие привязки» и фоновый синк цен).
        RecipeSource source = priceSyncService.mappingSourceOrNull(providerCode);
        if (source == null) return List.of();
        return mappingRepository.findBySourceWithIngredients(source).stream()
                .map(this::toBindingDto)
                .toList();
    }

    /** Fix-15: единая сборка DTO привязки (список «Текущие привязки» и ответ createMapping). */
    private IngredientBindingDto toBindingDto(IngredientMapping m) {
        ExternalProduct ep = m.getExternalProduct();
        return new IngredientBindingDto(
                m.getId(),
                m.getInternalIngredient().getId(),
                m.getInternalIngredient().getName(),
                m.getExternalCode(),
                m.getExternalName(),
                ep != null ? ep.getPackAmount() : null,
                ep != null ? ep.getPackUnit() : null,
                m.getCreatedAt());
    }

    @Transactional
    public void deleteMapping(Long ingredientId, String providerCode) {
        IngredientMapping mapping = mappingRepository.findByInternalIngredientIdAndSource(
                ingredientId, parseProviderSource(providerCode))
                .orElseThrow(() -> new NotFoundException("Mapping not found"));

        mappingRepository.delete(mapping);
        log.info("Deleted mapping for ingredient {} from provider {}", ingredientId, providerCode);
    }

    /**
     * FIX (P1, аудит Phase 11): синхронизация цен стала фоновой.
     * Проверка провайдера/конкурентности и создание SyncLog(RUNNING) выполняются
     * в потоке запроса; долгие внешние HTTP-вызовы провайдера цен уходят в пул
     * "off-sync-*" через @Async-прокси (self via ObjectProvider — иначе internal call
     * обошёл бы прокси Spring и аннотация не сработала).
     * Контроллер по-прежнему отвечает 202 ACCEPTED + logId: прогресс виден в /sync-logs.
     */
    public SyncLog syncPrices(String providerCode, Long userId) {
        Integration integration = integrationRepository.findByProvider(providerCode)
                .orElseThrow(() -> new NotFoundException("Integration not found: " + providerCode));

        if (!"CONNECTED".equals(integration.getStatus())) {
            throw new com.provision.exception.ConflictException("INTEGRATION_DISCONNECTED: Provider is not connected");
        }

        // Проверка на параллельный запуск
        Optional<SyncLog> runningSync = syncLogRepository.findRunningByProvider(providerCode);
        if (runningSync.isPresent()) {
            throw new com.provision.exception.ConflictException("SYNC_ALREADY_RUNNING: Sync is already running for provider " + providerCode);
        }

        // Получение пользователя
        com.provision.entity.User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        // Создаём лог синхронизации
        SyncLog syncLog = SyncLog.builder()
                .provider(providerCode)
                .type("PRICES")
                .status("RUNNING")
                .triggeredBy("MANUAL")
                .triggeredUser(user)
                .startedAt(LocalDateTime.now())
                .createdCount(0)
                .updatedCount(0)
                .errorCount(0)
                .build();
        syncLog = syncLogRepository.save(syncLog);

        // FIX (P1): тяжёлая часть (внешний HTTP + запись цен) — в фоне, в PriceSyncService.
        // self == this для unit-тестов (ObjectProvider=null): синхронный вызов без прокси.
        IntegrationService self = selfProvider != null ? selfProvider.getObject() : this;
        self.executePriceSync(providerCode, syncLog.getId());

        return syncLog;
    }

    /**
     * Фоновая часть синхронизации цен: выполняется вне HTTP-потока и вне БД-транзакции,
     * исключения не выпрыгивают наружу (async) — статус и детали пишутся в SyncLog.
     *
     * <p>Fix-16: вся работа (чтение маппингов слепком, внешний HTTP, запись цен,
     * финализация журнала) переехала в {@link PriceSyncService} — здесь осталась только
     * граница {@code @Async}. Причина переезда: в фоновом потоке нет БД-сессии
     * ({@code open-in-view: false}), а прежний код обращался к LAZY-ассоциациям
     * {@code IngredientMapping} уже после закрытия сессии и падал на первом же маппинге с
     * {@code LazyInitializationException: could not initialize proxy [Ingredient#…] - no Session}
     * — синк финишировал фатальной ошибкой при пустых деталях («Постатейных данных нет»).</p>
     */
    @Async("taskExecutor")
    public void executePriceSync(String providerCode, Long syncLogId) {
        priceSyncService.runPriceSync(providerCode, syncLogId);
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

    /**
     * Парсит код провайдера в RecipeSource с понятной ошибкой вместо
     * "No enum constant ..." (IllegalArgumentException из valueOf).
     */
    private RecipeSource parseProviderSource(String providerCode) {
        try {
            return RecipeSource.valueOf(providerCode);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException("Неизвестный источник/провайдер: " + providerCode);
        }
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
