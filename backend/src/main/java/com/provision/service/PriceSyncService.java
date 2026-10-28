package com.provision.service;

import com.provision.entity.ExternalProduct;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientMapping;
import com.provision.entity.IngredientPrice;
import com.provision.entity.RecipeSource;
import com.provision.entity.SyncLog;
import com.provision.integration.ExternalPriceDto;
import com.provision.integration.ExternalProductDto;
import com.provision.integration.PriceProvider;
import com.provision.integration.ProductInfoProvider;
import com.provision.repository.ExternalProductRepository;
import com.provision.repository.IngredientMappingRepository;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.IngredientRepository;
import com.provision.repository.IntegrationRepository;
import com.provision.repository.SyncLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Фоновая синхронизация цен провайдера (Fix-16: вынесено из {@link IntegrationService}
 * по R8/R9 — одна ответственность «провести синк цен и честно отчитаться», отдельный модуль).
 *
 * <h3>Транзакционная модель (и почему она именно такая)</h3>
 * Оркестрация {@link #runPriceSync} выполняется БЕЗ транзакции: внешний HTTP провайдера
 * (у ЕМИСС это тяжёлая SDMX-выгрузка) не должен держать открытой БД-сессию и соединение пула.
 * Отсюда два следствия, которые и чинит Fix-16:
 * <ol>
 *   <li><b>Никаких JPA-проксей в фоне.</b> {@code IngredientMapping.internalIngredient} и
 *       {@code externalProduct} — LAZY, а {@code open-in-view: false}: после
 *       {@code findBySource(...)} объекты detached, и первое же {@code ingredient.getName()}
 *       роняло весь синк с {@code LazyInitializationException: … no Session}
 *       (журнал показывал «Постатейных данных нет» + фатальную ошибку, цены не писались).
 *       Теперь маппинги читаются одним {@code JOIN FETCH}-запросом в короткой read-only
 *       транзакции {@link #loadPriceSyncTargets} и сразу превращаются в plain-record
 *       {@link PriceSyncTarget} — дальше фон работает только со снимком данных.</li>
 *   <li><b>Запись — короткие транзакции через self-прокси.</b> {@code REQUIRES_NEW}-методы
 *       вызываются через {@link #self()} ({@code ObjectProvider}), иначе internal call
 *       обошёл бы прокси Spring и аннотация транзакции молча игнорировалась
 *       (так было до Fix-16: цены писались на auto-commit отдельных {@code save()}).</li>
 * </ol>
 *
 * <p>Исключения наружу не выпрыгивают (метод вызывается из {@code @Async}-потока) —
 * результат всегда фиксируется в {@code SyncLog}: счётчики, статус SUCCESS/PARTIAL/FAILED
 * и {@code details} (jsonb) с постатейными итогами и текстами ошибок для drawer'а журнала.</p>
 */
@Service
@Slf4j
public class PriceSyncService {

    private final Map<String, PriceProvider> providers;
    private final IngredientMappingRepository mappingRepository;
    private final IngredientRepository ingredientRepository;
    private final ExternalProductRepository externalProductRepository;
    private final IngredientPriceRepository priceRepository;
    private final SyncLogRepository syncLogRepository;
    private final IntegrationRepository integrationRepository;
    /** Fix-16 (U11): освежение карточки внешнего продукта — отдельная ответственность/R9. */
    private final ExternalProductCardService cardService;
    // Self-injection через ObjectProvider: вызов @Transactional(REQUIRES_NEW)-методов
    // должен идти через прокси Spring. ObjectProvider (а не прямой self-инжект) разрывает
    // цикл создания бина и позволяет unit-тестам конструировать сервис с null-провайдером.
    private final ObjectProvider<PriceSyncService> selfProvider;

    /** Конструктор для unit-тестов: без self-провайдера (self() == this, транзакций нет). */
    public PriceSyncService(List<PriceProvider> providerList,
                            IngredientMappingRepository mappingRepository,
                            IngredientRepository ingredientRepository,
                            ExternalProductRepository externalProductRepository,
                            IngredientPriceRepository priceRepository,
                            SyncLogRepository syncLogRepository,
                            IntegrationRepository integrationRepository,
                            ExternalProductCardService cardService) {
        this(providerList, mappingRepository, ingredientRepository, externalProductRepository,
                priceRepository, syncLogRepository, integrationRepository, cardService, null);
    }

    @Autowired
    public PriceSyncService(List<PriceProvider> providerList,
                            IngredientMappingRepository mappingRepository,
                            IngredientRepository ingredientRepository,
                            ExternalProductRepository externalProductRepository,
                            IngredientPriceRepository priceRepository,
                            SyncLogRepository syncLogRepository,
                            IntegrationRepository integrationRepository,
                            ExternalProductCardService cardService,
                            ObjectProvider<PriceSyncService> selfProvider) {
        this.providers = new HashMap<>();
        for (PriceProvider provider : providerList) {
            this.providers.put(provider.code(), provider);
        }
        this.mappingRepository = mappingRepository;
        this.ingredientRepository = ingredientRepository;
        this.externalProductRepository = externalProductRepository;
        this.priceRepository = priceRepository;
        this.syncLogRepository = syncLogRepository;
        this.integrationRepository = integrationRepository;
        this.cardService = cardService;
        this.selfProvider = selfProvider;
        log.debug("PriceSyncService ready, providers: {}", this.providers.keySet());
    }

    /**
     * Слепок данных маппинга для работы вне БД-сессии: только значения, никаких проксей.
     * {@code productId == null} — маппинг без карточки внешнего продукта (синк помечает
     * его SKIPPED и показывает в деталях, а не молча теряет).
     */
    public record PriceSyncTarget(Long mappingId, Long ingredientId, String ingredientName,
                                  String ingredientUnit, String externalCode, Long productId,
                                  BigDecimal packAmount, String packUnit) {}

    /**
     * Оркестрация фонового синка цен. Вызывается из {@code @Async}-потока
     * ({@link IntegrationService#executePriceSync}); сам НЕ транзакционный и не асинхронный.
     *
     * @param providerCode код провайдера цен (= {@link RecipeSource} у маппингов)
     * @param syncLogId    id записи журнала в статусе RUNNING (создана в потоке запроса)
     */
    public void runPriceSync(String providerCode, Long syncLogId) {
        SyncLog syncLog = syncLogRepository.findById(syncLogId).orElse(null);
        if (syncLog == null) {
            log.error("Price sync aborted: SyncLog {} not found (provider={})", syncLogId, providerCode);
            return;
        }
        log.info("Price sync started: provider={}, syncLogId={}, triggeredBy={}",
                providerCode, syncLogId, syncLog.getTriggeredBy());

        int created = 0;
        int updated = 0;
        int errors = 0;
        int requestCount = 0;
        // Fix-15: детали запуска — на каждый маппинг пишется постатейная строка items
        // (действие + причина/текст ошибки), на каждый сбой — errors-запись; всё уходит
        // в SyncLog.details (jsonb) и отображается в drawer'е журнала синков.
        List<Map<String, Object>> items = new ArrayList<>();
        List<Map<String, Object>> errorEntries = new ArrayList<>();

        try {
            PriceProvider provider = providers.get(providerCode);
            if (provider == null) {
                // Раньше здесь прилетал голый NPE из provider.fetchPrices — теперь причина явная.
                throw new IllegalStateException("Нет провайдера цен с кодом " + providerCode
                        + " (доступны: " + providers.keySet() + ")");
            }

            // FIX (P0): RecipeSource.valueOf падал с "No enum constant" — парсим безопасно
            // для провайдеров, не являющихся источниками рецептов (маппингов у них нет).
            RecipeSource mappingSource = mappingSourceOrNull(providerCode);
            // Fix-16: читаем маппинги ВНУТРИ короткой транзакции и сразу снимаем слепок —
            // в фоне остаются только значения (см. PriceSyncTarget).
            List<PriceSyncTarget> targets = self().loadPriceSyncTargets(mappingSource);
            log.info("Price sync {}: {} mapping(s) with external code loaded (source={})",
                    providerCode, targets.size(), mappingSource);

            for (PriceSyncTarget target : targets) {
                String externalCode = target.externalCode();
                try {
                    if (target.productId() == null) {
                        String reason = "Нет карточки внешнего продукта";
                        log.info("Skipping mapping {} ({}): {}", target.mappingId(), externalCode, reason);
                        items.add(SyncDetailsBuilder.item(itemOf(target, null, null, null, "SKIPPED", reason)));
                        continue;
                    }

                    // Внешний HTTP — ВНЕ транзакции БД (главная цель P1-фикса)
                    requestCount++;
                    List<ExternalPriceDto> prices = provider.fetchPrices(externalCode, null);
                    log.debug("Fetched {} price point(s) for {} (mapping {})",
                            prices == null ? 0 : prices.size(), externalCode, target.mappingId());

                    // Запись цен — короткая отдельная транзакция на маппинг
                    MappingSyncOutcome outcome = self().applyMappingPricesInTx(target, prices, providerCode);
                    created += outcome.created();
                    updated += outcome.updated();
                    items.add(SyncDetailsBuilder.item(itemOf(target, outcome.lastDate(),
                            outcome.oldPrice(), outcome.newPrice(), outcome.action(), outcome.reason())));
                    log.info("Mapping {} ({} → ингредиент {} «{}»): {} — {}",
                            target.mappingId(), externalCode, target.ingredientId(),
                            target.ingredientName(), outcome.action(), outcome.reason());

                    // FIX (U11): обновление карточки внешнего продукта (название/бренд/
                    // фасовка/фото) — только для провайдеров с ProductInfoProvider.
                    // Провал не считаем ошибкой синка: цены уже сохранены, карточка вторична.
                    if (provider instanceof ProductInfoProvider infoProvider) {
                        try {
                            Optional<ExternalProductDto> info = infoProvider.fetchProductInfo(externalCode);
                            if (info.isPresent()) {
                                updated += cardService.refresh(target.productId(), info.get());
                            }
                        } catch (Exception e) {
                            log.warn("Product card update failed for external code {}: {}",
                                    externalCode, e.getMessage());
                        }
                    }
                } catch (Exception e) {
                    errors++;
                    String message = SyncDetailsBuilder.messageOf(e);
                    log.error("Price sync failed for mapping {} (externalCode={}, ingredientId={}): {}",
                            target.mappingId(), externalCode, target.ingredientId(), message, e);
                    errorEntries.add(SyncDetailsBuilder.error(externalCode, message));
                    items.add(SyncDetailsBuilder.item(itemOf(target, null, null, null, "ERROR", message)));
                }
            }

            self().finalizeSyncLog(syncLogId, created, updated, errors,
                    SyncDetailsBuilder.details(requestCount, items, errorEntries, null));
            log.info("Price sync finished: provider={}, syncLogId={}, created={}, updated={}, errors={}, requests={}",
                    providerCode, syncLogId, created, updated, errors, requestCount);

        } catch (Exception e) {
            String message = SyncDetailsBuilder.messageOf(e);
            // Fix-15: фатальный сбой (вне цикла маппингов) — текст виден в drawer'е
            // (fatalError) и первой записью в errors (баннер «Последний запуск упал»).
            errorEntries.add(0, SyncDetailsBuilder.error("—", message));
            self().finalizeSyncLog(syncLogId, created, updated, errors + 1,
                    SyncDetailsBuilder.details(requestCount, items, errorEntries, message));
            log.error("Price sync failed for provider {} (syncLogId={}): {}",
                    providerCode, syncLogId, message, e);
        }
    }

    /**
     * Fix-16: короткая read-only транзакция — снимок маппингов источника для фонового синка.
     * Ассоциации инициализируются JOIN FETCH-запросом, поэтому после закрытия сессии
     * {@link #runPriceSync} работает с обычными значениями, а не с ленивыми прокси.
     */
    @Transactional(readOnly = true)
    public List<PriceSyncTarget> loadPriceSyncTargets(RecipeSource source) {
        if (source == null) {
            return List.of();
        }
        return mappingRepository.findBySourceWithIngredientAndProduct(source).stream()
                .map(PriceSyncService::toTarget)
                .toList();
    }

    /** Снимок одного маппинга; терпим к отсутствию ингредиента/карточки продукта. */
    private static PriceSyncTarget toTarget(IngredientMapping m) {
        Ingredient ingredient = m.getInternalIngredient();
        ExternalProduct product = m.getExternalProduct();
        return new PriceSyncTarget(
                m.getId(),
                ingredient != null ? ingredient.getId() : null,
                ingredient != null ? ingredient.getName() : null,
                ingredient != null && ingredient.getUnit() != null ? ingredient.getUnit().name() : null,
                m.getExternalCode(),
                product != null ? product.getId() : null,
                product != null ? product.getPackAmount() : null,
                product != null ? product.getPackUnit() : null);
    }

    /**
     * Fix-15: результат синхронизации цен одного маппинга — счётчики + данные
     * самой свежей ценовой точки (дата, старая→новая цена, действие, пояснение).
     * Идёт в SyncLog.details.items, чтобы drawer журнала показывал процесс постатейно.
     */
    public record MappingSyncOutcome(int created, int updated, LocalDate lastDate,
                                     BigDecimal oldPrice, BigDecimal newPrice,
                                     String action, String reason) {}

    /**
     * Короткая транзакция на один маппинг: внешний HTTP к этому моменту уже выполнен.
     *
     * <p>Fix-16: ингредиент и карточка продукта перезагружаются по id ВНУТРИ транзакции —
     * detached-объекты (тем более ленивые прокси без сессии) сюда не передаются:
     * managed-сущность нужна и для dirty-checking ручных цен, и для связи новой цены.</p>
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public MappingSyncOutcome applyMappingPricesInTx(PriceSyncTarget target,
                                                     List<ExternalPriceDto> prices,
                                                     String providerCode) {
        int created = 0;
        int updated = 0;
        int skippedManual = 0;
        int skippedInvalid = 0;

        if (prices == null || prices.isEmpty()) {
            log.info("No price data from provider for {} (mapping {})",
                    target.externalCode(), target.mappingId());
            return new MappingSyncOutcome(0, 0, null, null, null, "SKIPPED",
                    "У категории нет данных о ценах в выгрузке");
        }

        Ingredient ingredient = target.ingredientId() == null
                ? null
                : ingredientRepository.findById(target.ingredientId()).orElse(null);
        if (ingredient == null) {
            log.warn("Ingredient {} of mapping {} vanished — prices not written",
                    target.ingredientId(), target.mappingId());
            return new MappingSyncOutcome(0, 0, null, null, null, "SKIPPED",
                    "Внутренний продукт не найден (id " + target.ingredientId() + ")");
        }
        ExternalProduct product = externalProductRepository.findById(target.productId()).orElse(null);
        if (product == null) {
            log.warn("External product {} of mapping {} vanished — prices not written",
                    target.productId(), target.mappingId());
            return new MappingSyncOutcome(0, 0, null, null, null, "SKIPPED",
                    "Карточка внешнего продукта не найдена (id " + target.productId() + ")");
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

            // Конвертируем цену в цену за единицу внутреннего продукта
            BigDecimal unitPrice = UnitPriceConverter.unitPrice(
                    externalPrice.price(),
                    product.getPackAmount(),
                    product.getPackUnit(),
                    ingredient.getUnit() == null ? null : ingredient.getUnit().name()
            );

            if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
                skippedInvalid++;
                continue;
            }

            // Проверяем, существует ли цена на эту дату
            Optional<IngredientPrice> existingPrice = priceRepository
                    .findByIngredientIdAndEffectiveFrom(ingredient.getId(), externalPrice.date());

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
                IngredientPrice newPrice = IngredientPrice.builder()
                        .ingredient(ingredient)
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
            log.warn("SyncLog {} vanished before finalization", syncLogId);
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
        log.info("SyncLog {} finalized: status={}, created={}, updated={}, errors={}",
                syncLogId, status, created, updated, errors);

        // Обновляем last_sync_at в интеграции
        integrationRepository.findByProvider(syncLog.getProvider()).ifPresent(integration -> {
            integration.setLastSyncAt(LocalDateTime.now());
            integrationRepository.save(integration);
        });
    }

    /** Склеивает слепок маппинга и результат записи в строку постатейного отчёта (Fix-15/16). */
    private static SyncDetailsBuilder.Item itemOf(PriceSyncTarget target, LocalDate priceDate,
                                                  BigDecimal oldPrice, BigDecimal newPrice,
                                                  String action, String reason) {
        return new SyncDetailsBuilder.Item(target.ingredientId(), target.ingredientName(),
                target.externalCode(), priceDate, oldPrice, newPrice, action, reason);
    }

    /**
     * Безопасный парсинг кода провайдера в источник рецептов: если код провайдера
     * не является {@link RecipeSource} — возвращаем null (маппингов нет, синхронизируем 0).
     *
     * <p>FIX (P0): раньше здесь был {@code RecipeSource.valueOf}, который падал с
     * «No enum constant» на провайдерах, не являющихся источниками рецептов.
     * Fix-16: метод публичный — его же использует {@link IntegrationService#getMappings}
     * («Текущие привязки»), чтобы парсинг кода провайдера жил в одном месте.</p>
     */
    public RecipeSource mappingSourceOrNull(String providerCode) {
        try {
            return RecipeSource.valueOf(providerCode);
        } catch (IllegalArgumentException e) {
            log.warn("Provider {} is not a RecipeSource; nothing to sync", providerCode);
            return null;
        }
    }

    /** Прокси Spring для REQUIRES_NEW-методов; в unit-тестах (selfProvider == null) — this. */
    private PriceSyncService self() {
        return selfProvider != null ? selfProvider.getObject() : this;
    }
}
