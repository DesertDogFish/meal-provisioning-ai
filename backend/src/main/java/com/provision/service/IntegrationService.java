package com.provision.service;

import com.provision.dto.integration.IntegrationDto;
import com.provision.dto.integration.IngredientMappingRequest;
import com.provision.dto.integration.SyncLogDto;
import com.provision.entity.*;
import com.provision.exception.NotFoundException;
import com.provision.integration.*;
import com.provision.repository.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
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
    private final IngredientPriceRepository priceRepository;
    private final IngredientRepository ingredientRepository;
    private final SyncLogRepository syncLogRepository;
    private final UserRepository userRepository;

    public IntegrationService(
            List<PriceProvider> providerList,
            IntegrationRepository integrationRepository,
            ExternalProductRepository externalProductRepository,
            IngredientMappingRepository mappingRepository,
            IngredientPriceRepository priceRepository,
            IngredientRepository ingredientRepository,
            SyncLogRepository syncLogRepository,
            UserRepository userRepository) {
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
        integration.setErrorMessage(status.message());
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
    public void createMapping(Long ingredientId, IngredientMappingRequest request) {
        Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new NotFoundException("Ingredient not found: " + ingredientId));

        // Проверяем, существует ли уже маппинг для этого ингредиента и провайдера
        Optional<IngredientMapping> existing = mappingRepository.findByInternalIngredientIdAndSource(
                ingredientId, RecipeSource.valueOf(request.provider()));

        if (existing.isPresent()) {
            throw new IllegalStateException("Mapping already exists for this ingredient and provider");
        }

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

        IngredientMapping mapping = IngredientMapping.builder()
                .externalName(ingredient.getName())
                .source(RecipeSource.valueOf(request.provider()))
                .internalIngredient(ingredient)
                .externalCode(request.externalCode())
                .externalProduct(externalProduct)
                .build();

        mappingRepository.save(mapping);
        log.info("Created mapping for ingredient {} to external product {}", ingredientId, request.externalCode());
    }

    @Transactional
    public void deleteMapping(Long ingredientId, String providerCode) {
        IngredientMapping mapping = mappingRepository.findByInternalIngredientIdAndSource(
                ingredientId, RecipeSource.valueOf(providerCode))
                .orElseThrow(() -> new NotFoundException("Mapping not found"));

        mappingRepository.delete(mapping);
        log.info("Deleted mapping for ingredient {} from provider {}", ingredientId, providerCode);
    }

    @Transactional
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

        PriceProvider provider = providers.get(providerCode);
        
        try {
            // Получаем все маппинги для этого провайдера с внешним кодом
            List<IngredientMapping> mappings = mappingRepository.findBySource(RecipeSource.valueOf(providerCode))
                    .stream()
                    .filter(m -> m.getExternalCode() != null)
                    .toList();

            int created = 0;
            int updated = 0;
            int errors = 0;

            for (IngredientMapping mapping : mappings) {
                try {
                    ExternalProduct product = mapping.getExternalProduct();
                    if (product == null) {
                        continue;
                    }

                    // Получаем цены из внешнего источника
                    List<ExternalPriceDto> prices = provider.fetchPrices(mapping.getExternalCode(), null);

                    for (ExternalPriceDto externalPrice : prices) {
                        // Фильтруем только RUB
                        if (!"RUB".equals(externalPrice.currency())) {
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
                            continue;
                        }

                        // Проверяем, существует ли цена на эту дату
                        Optional<IngredientPrice> existingPrice = priceRepository
                                .findByIngredientIdAndEffectiveFrom(
                                        mapping.getInternalIngredient().getId(),
                                        externalPrice.date()
                                );

                        if (existingPrice.isPresent()) {
                            IngredientPrice price = existingPrice.get();
                            // Не перезаписываем ручные цены
                            if (!"MANUAL".equals(price.getSource())) {
                                price.setPricePerUnit(unitPrice);
                                price.setSource(providerCode);
                                priceRepository.save(price);
                                updated++;
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
                        }
                    }
                } catch (Exception e) {
                    log.error("Failed to sync prices for mapping {}: {}", mapping.getId(), e.getMessage());
                    errors++;
                }
            }

            // Обновляем лог
            syncLog.setStatus("SUCCESS");
            syncLog.setFinishedAt(LocalDateTime.now());
            syncLog.setCreatedCount(created);
            syncLog.setUpdatedCount(updated);
            syncLog.setErrorCount(errors);
            syncLogRepository.save(syncLog);

            // Обновляем last_sync_at в интеграции
            integration.setLastSyncAt(LocalDateTime.now());
            integrationRepository.save(integration);

            log.info("Sync completed for provider {}: created={}, updated={}, errors={}", 
                    providerCode, created, updated, errors);

        } catch (Exception e) {
            syncLog.setStatus("FAILED");
            syncLog.setFinishedAt(LocalDateTime.now());
            syncLog.setErrorCount(syncLog.getErrorCount() + 1);
            syncLogRepository.save(syncLog);
            log.error("Sync failed for provider {}: {}", providerCode, e.getMessage());
            throw e;
        }

        return syncLog;
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
