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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
    private final IngredientPriceRepository priceRepository;
    private final IngredientRepository ingredientRepository;
    private final SyncLogRepository syncLogRepository;
    private final UserRepository userRepository;
    // FIX (P1): self-injection через ObjectProvider — вызов @Async-метода должен идти
    // через прокси Spring, иначе аннотация игнорируется при internal call.
    // ObjectProvider нужен, чтобы unit-тесты конструировали сервис с null-бином.
    private final org.springframework.beans.factory.ObjectProvider<IntegrationService> selfProvider;

    public IntegrationService(
            List<PriceProvider> providerList,
            IntegrationRepository integrationRepository,
            ExternalProductRepository externalProductRepository,
            IngredientMappingRepository mappingRepository,
            IngredientPriceRepository priceRepository,
            IngredientRepository ingredientRepository,
            SyncLogRepository syncLogRepository,
            UserRepository userRepository) {
        this(providerList, integrationRepository, externalProductRepository, mappingRepository,
                priceRepository, ingredientRepository, syncLogRepository, userRepository, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public IntegrationService(
            List<PriceProvider> providerList,
            IntegrationRepository integrationRepository,
            ExternalProductRepository externalProductRepository,
            IngredientMappingRepository mappingRepository,
            IngredientPriceRepository priceRepository,
            IngredientRepository ingredientRepository,
            SyncLogRepository syncLogRepository,
            UserRepository userRepository,
            org.springframework.beans.factory.ObjectProvider<IntegrationService> selfProvider) {
        this.providers = new HashMap<>();
        for (PriceProvider provider : providerList) {
            this.providers.put(provider.code(), provider);
        }
        this.integrationRepository = integrationRepository;
        this.externalProductRepository = externalProductRepository;
        this.mappingRepository = mappingRepository;
        this.priceRepository = priceRepository;
        this.ingredientRepository = ingredientRepository;
        this.syncLogRepository = syncLogRepository;
        this.userRepository = userRepository;
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
        RecipeSource source = parseMappingSource(providerCode);
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
     * в потоке запроса; долгие внешние HTTP-вызовы к Open Food Facts уходят в пул
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

        // FIX (P1): тяжёлая часть (внешний HTTP + запись цен) — в фоне.
        // self == this для unit-тестов (ObjectProvider=null): синхронный вызов без прокси.
        IntegrationService self = selfProvider != null ? selfProvider.getObject() : this;
        self.executePriceSync(providerCode, syncLog.getId());

        return syncLog;
    }

    /**
     * Фоновая часть синхронизации: выполняется вне HTTP-потока и вне БД-транзакции.
     * Исключения не выпрыгивают наружу (async) — статус пишется в SyncLog.
     */
    @Async("taskExecutor")
    public void executePriceSync(String providerCode, Long syncLogId) {
        SyncLog syncLog = syncLogRepository.findById(syncLogId).orElse(null);
        if (syncLog == null) {
            log.error("SyncLog {} vanished before async price sync started", syncLogId);
            return;
        }

        int created = 0;
        int updated = 0;
        int errors = 0;
        int requestCount = 0;
        // Fix-15: детали запуска — раньше ошибки уходили только в серверный лог,
        // а журнал показывал голый счётчик «Ошибки: N» при статусе SUCCESS
        // (боль: «какой же это успех, когда Ошибки 2», «где детали ошибок?»,
        // «где вообще детали процесса?»). Теперь на каждый маппинг пишется
        // постатейная строка items (действие + причина/текст ошибки), на каждый
        // сбой — errors-запись с человекочитаемым сообщением; всё сохраняется в
        // SyncLog.details (jsonb) и отображается в drawer'е журнала синков.
        List<Map<String, Object>> items = new ArrayList<>();
        List<Map<String, Object>> errorEntries = new ArrayList<>();

        try {
            PriceProvider provider = providers.get(providerCode);

            // Получаем все маппинги для этого провайдера с внешним кодом.
            // FIX (P0): RecipeSource.valueOf падал с "No enum constant" —
            // парсим безопасно на случай провайдеров, не являющихся источниками рецептов.
            RecipeSource mappingSource = parseMappingSource(providerCode);
            List<IngredientMapping> mappings = mappingSource == null
                    ? List.of()
                    : mappingRepository.findBySource(mappingSource)
                            .stream()
                            .filter(m -> m.getExternalCode() != null)
                            .toList();

            for (IngredientMapping mapping : mappings) {
                String externalCode = mapping.getExternalCode();
                Ingredient ingredient = mapping.getInternalIngredient();
                Long ingredientId = ingredient != null ? ingredient.getId() : null;
                String ingredientName = ingredient != null ? ingredient.getName() : null;
                try {
                    ExternalProduct product = mapping.getExternalProduct();
                    if (product == null) {
                        items.add(syncItem(ingredientId, ingredientName, externalCode,
                                null, null, null, "SKIPPED", "Нет карточки внешнего продукта"));
                        continue;
                    }

                    // Внешний HTTP — ВНЕ транзакции БД (главная цель P1-фикса)
                    requestCount++;
                    List<ExternalPriceDto> prices = provider.fetchPrices(externalCode, null);

                    // Запись цен — короткая отдельная транзакция на маппинг
                    MappingSyncOutcome outcome = applyMappingPricesInTx(mapping, product, prices, providerCode);
                    created += outcome.created();
                    updated += outcome.updated();
                    items.add(syncItem(ingredientId, ingredientName, externalCode,
                            outcome.lastDate(), outcome.oldPrice(), outcome.newPrice(),
                            outcome.action(), outcome.reason()));

                    // FIX (U11): обновление карточки внешнего продукта
                    // (название/бренд/фасовка/фото) — только для провайдеров,
                    // умеющих ProductInfoProvider. Провал не считаем ошибкой
                    // синхронизации: цены уже сохранены, карточка вторична.
                    if (provider instanceof ProductInfoProvider infoProvider) {
                        try {
                            Optional<ExternalProductDto> info =
                                    infoProvider.fetchProductInfo(externalCode);
                            if (info.isPresent()) {
                                updated += updateExternalProductInTx(product, info.get());
                            }
                        } catch (Exception e) {
                            log.warn("Product card update failed for external code {}: {}",
                                    externalCode, e.getMessage());
                        }
                    }
                } catch (Exception e) {
                    log.error("Failed to sync prices for mapping {}: {}", mapping.getId(), e.getMessage(), e);
                    errors++;
                    String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                    errorEntries.add(syncError(externalCode, message));
                    items.add(syncItem(ingredientId, ingredientName, externalCode,
                            null, null, null, "ERROR", message));
                }
            }

            finalizeSyncLog(syncLogId, created, updated, errors,
                    syncDetails(requestCount, items, errorEntries, null));
            log.info("Sync completed for provider {}: created={}, updated={}, errors={}",
                    providerCode, created, updated, errors);

        } catch (Exception e) {
            String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            // Fix-15: фатальный сбой (вне цикла маппингов) — текст виден в drawer'е
            // (fatalError) и первой записью в errors (баннер «Последний запуск упал»).
            errorEntries.add(0, syncError("—", message));
            finalizeSyncLog(syncLogId, created, updated, errors + 1,
                    syncDetails(requestCount, items, errorEntries, message));
            log.error("Sync failed for provider {}: {}", providerCode, message, e);
        }
    }

    /**
     * Fix-15: результат синхронизации цен одного маппинга — счётчики + данные
     * самой свежей ценовой точки (дата, старая→новая цена, действие, пояснение).
     * Идёт в SyncLog.details.items, чтобы drawer журнала показывал процесс
     * постатейно («Постатейных данных нет» — больше не пустой экран).
     */
    public record MappingSyncOutcome(int created, int updated, LocalDate lastDate,
                                     BigDecimal oldPrice, BigDecimal newPrice,
                                     String action, String reason) {}

    /** Короткая транзакция на один маппинг: внешний HTTP к этому моменту уже выполнен. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MappingSyncOutcome applyMappingPricesInTx(IngredientMapping mapping, ExternalProduct product,
                                                     List<ExternalPriceDto> prices, String providerCode) {
        int created = 0;
        int updated = 0;
        int skippedManual = 0;
        int skippedInvalid = 0;

        if (prices == null || prices.isEmpty()) {
            return new MappingSyncOutcome(0, 0, null, null, null, "SKIPPED",
                    "У категории нет данных о ценах в выгрузке");
        }

        // Самая свежая точка — её видно в журнале (старая → новая, действие)
        LocalDate maxDate = null;
        for (ExternalPriceDto p : prices) {
            if (maxDate == null || p.date().isAfter(maxDate)) maxDate = p.date();
        }
        LocalDate lastDate = null;
        BigDecimal lastOld = null;
        BigDecimal lastNew = null;
        String lastAction = null;

        for (ExternalPriceDto externalPrice : prices) {
            // Фильтруем только RUB
            if (!"RUB".equals(externalPrice.currency())) {
                skippedInvalid++;
                continue;
            }

            // Конвертируем цену в цену за единицу
            BigDecimal unitPrice = calculateUnitPrice(
                    externalPrice.price(),
                    product.getPackAmount(),
                    product.getPackUnit(),
                    mapping.getInternalIngredient().getUnit().name()
            );

            if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
                skippedInvalid++;
                continue;
            }

            // Проверяем, существует ли цена на эту дату
            Optional<IngredientPrice> existingPrice = priceRepository
                    .findByIngredientIdAndEffectiveFrom(
                            mapping.getInternalIngredient().getId(),
                            externalPrice.date()
                    );

            BigDecimal oldPrice = null;
            String action;
            if (existingPrice.isPresent()) {
                IngredientPrice price = existingPrice.get();
                oldPrice = price.getPricePerUnit();
                // Не перезаписываем ручные цены
                if ("MANUAL".equals(price.getSource())) {
                    skippedManual++;
                    action = "SKIPPED_MANUAL";
                } else {
                    price.setPricePerUnit(unitPrice);
                    price.setSource(providerCode);
                    priceRepository.save(price);
                    updated++;
                    action = "UPDATED";
                }
            } else {
                // Создаём новую цену
                IngredientPrice newPrice = IngredientPrice.builder()
                        .ingredient(mapping.getInternalIngredient())
                        .pricePerUnit(unitPrice)
                        .currency("RUB")
                        .effectiveFrom(externalPrice.date())
                        .source(providerCode)
                        .build();
                priceRepository.save(newPrice);
                created++;
                action = "CREATED";
            }

            if (externalPrice.date().equals(maxDate)) {
                lastDate = maxDate;
                lastOld = oldPrice;
                lastNew = "SKIPPED_MANUAL".equals(action) ? null : unitPrice;
                lastAction = action;
            }
        }

        StringBuilder reason = new StringBuilder();
        reason.append("Точек цен: ").append(prices.size())
              .append(", создано: ").append(created)
              .append(", обновлено: ").append(updated);
        if (skippedManual > 0) reason.append(", защищено ручных цен: ").append(skippedManual);
        if (skippedInvalid > 0) reason.append(", отброшено (валюта/единицы): ").append(skippedInvalid);

        return new MappingSyncOutcome(created, updated, lastDate, lastOld, lastNew,
                lastAction == null ? "SKIPPED" : lastAction, reason.toString());
    }

    /**
     * FIX (U11): короткая транзакция — обновление полей карточки внешнего
     * продукта свежими данными провайдера (название, бренд, фасовка, фото).
     * Пустые значения из ответа не затирают существующие данные.
     *
     * @return 1, если изменено хотя бы одно поле (идёт в SyncLog.updatedCount), иначе 0
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int updateExternalProductInTx(ExternalProduct product, ExternalProductDto info) {
        boolean changed = false;
        if (hasText(info.name()) && !info.name().equals(product.getName())) {
            product.setName(info.name());
            changed = true;
        }
        if (hasText(info.brand()) && !info.brand().equals(product.getBrand())) {
            product.setBrand(info.brand());
            changed = true;
        }
        if (info.packAmount() != null
                && (product.getPackAmount() == null
                    || product.getPackAmount().compareTo(info.packAmount()) != 0)) {
            product.setPackAmount(info.packAmount());
            changed = true;
        }
        if (hasText(info.packUnit()) && !info.packUnit().equals(product.getPackUnit())) {
            product.setPackUnit(info.packUnit());
            changed = true;
        }
        if (hasText(info.imageUrl()) && !info.imageUrl().equals(product.getImageUrl())) {
            product.setImageUrl(info.imageUrl());
            changed = true;
        }
        if (changed) {
            externalProductRepository.save(product);
        }
        return changed ? 1 : 0;
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    /**
     * Финализация лога и last_sync_at в отдельной короткой транзакции (фон без TX).
     * Fix-15: статус ВЫВОДИТСЯ из счётчиков — раньше хардкодился «SUCCESS» даже
     * когда все маппинги упали (боль: «какой же это успех, когда Ошибки 2»):
     * errors==0 → SUCCESS; errors>0 и ничего не записано → FAILED;
     * errors>0, но работа выполнена → PARTIAL (V25 расширяет CHECK-констрейнт).
     * details (jsonb) — постатейные итоги и тексты ошибок для drawer'а журнала.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void finalizeSyncLog(Long syncLogId, int created, int updated, int errors,
                                Map<String, Object> details) {
        SyncLog syncLog = syncLogRepository.findById(syncLogId).orElse(null);
        if (syncLog == null) {
            return;
        }
        String status = errors == 0 ? "SUCCESS" : (created + updated == 0 ? "FAILED" : "PARTIAL");
        syncLog.setStatus(status);
        syncLog.setFinishedAt(LocalDateTime.now());
        syncLog.setCreatedCount(created);
        syncLog.setUpdatedCount(updated);
        syncLog.setErrorCount(errors);
        syncLog.setDetails(details);
        syncLogRepository.save(syncLog);

        // Обновляем last_sync_at в интеграции
        integrationRepository.findByProvider(syncLog.getProvider()).ifPresent(integration -> {
            integration.setLastSyncAt(LocalDateTime.now());
            integrationRepository.save(integration);
        });
    }

    // ---- Fix-15: сборка details (jsonb-структура повторяет SyncLogResponse.SyncDetails) ----

    private static Map<String, Object> syncItem(Long productId, String productName, String externalCode,
                                                LocalDate priceDate, BigDecimal oldPrice, BigDecimal newPrice,
                                                String action, String reason) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", productId);
        m.put("productName", productName);
        m.put("externalCode", externalCode);
        m.put("priceDate", priceDate == null ? null : priceDate.toString());
        m.put("oldPrice", oldPrice == null ? null : oldPrice.doubleValue());
        m.put("newPrice", newPrice == null ? null : newPrice.doubleValue());
        m.put("action", action);
        m.put("reason", reason);
        m.put("anomaly", false);
        return m;
    }

    private static Map<String, Object> syncError(String externalCode, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("externalCode", externalCode);
        m.put("message", message);
        return m;
    }

    private static Map<String, Object> syncDetails(int requestCount, List<Map<String, Object>> items,
                                                   List<Map<String, Object>> errors, String fatalError) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("requestCount", requestCount);
        d.put("items", items);
        d.put("errors", errors);
        if (fatalError != null) d.put("fatalError", fatalError);
        return d;
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

    /**
     * Безопасная версия для синхронизации цен: если код провайдера не является
     * источником рецептов — возвращаем null (маппингов для него нет, синхронизируем 0).
     */
    private RecipeSource parseMappingSource(String providerCode) {
        try {
            return RecipeSource.valueOf(providerCode);
        } catch (IllegalArgumentException e) {
            log.warn("Provider {} is not a RecipeSource; nothing to sync", providerCode);
            return null;
        }
    }

    /**
     * Конвертирует цену упаковки в цену за единицу ингредиента
     * Например: 89.99 ₽ за 900 г -> 99.99 ₽/KG
     */
    private BigDecimal calculateUnitPrice(BigDecimal packPrice, BigDecimal packAmount, 
                                          String packUnit, String ingredientUnit) {
        if (packAmount == null || packAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }

        // Конвертируем packAmount в единицы ингредиента
        BigDecimal packAmountInIngredientUnit = convertToIngredientUnit(packAmount, packUnit, ingredientUnit);

        if (packAmountInIngredientUnit == null || packAmountInIngredientUnit.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }

        return packPrice.divide(packAmountInIngredientUnit, 2, RoundingMode.HALF_UP);
    }

    /**
     * Конвертирует количество из одной единицы в другую
     */
    private BigDecimal convertToIngredientUnit(BigDecimal amount, String fromUnit, String toUnit) {
        if (fromUnit == null || toUnit == null) {
            return null;
        }

        fromUnit = fromUnit.toUpperCase();
        toUnit = toUnit.toUpperCase();

        if (fromUnit.equals(toUnit)) {
            return amount;
        }

        // Конвертация веса
        if (fromUnit.equals("G") && toUnit.equals("KG")) {
            return amount.divide(BigDecimal.valueOf(1000), 6, RoundingMode.HALF_UP);
        } else if (fromUnit.equals("KG") && toUnit.equals("G")) {
            return amount.multiply(BigDecimal.valueOf(1000));
        }

        // Конвертация объёма
        if (fromUnit.equals("ML") && toUnit.equals("L")) {
            return amount.divide(BigDecimal.valueOf(1000), 6, RoundingMode.HALF_UP);
        } else if (fromUnit.equals("L") && toUnit.equals("ML")) {
            return amount.multiply(BigDecimal.valueOf(1000));
        }

        // Если единицы несовместимы, возвращаем null
        return null;
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
