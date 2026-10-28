package com.provision.service;

import com.provision.entity.SyncLog;
import com.provision.integration.EmisDataSource;
import com.provision.integration.EmisSnapshot;
import com.provision.repository.IntegrationRepository;
import com.provision.repository.SyncLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Фоновая синхронизация ЕМИСС (вынесена из {@link IntegrationService} в Fix-16 по R8/R9 —
 * одна ответственность «провести синк и честно отчитаться»).
 *
 * <h3>Что значит «синхронизировать» теперь</h3>
 * Три шага, все — про нашу БД:
 * <ol>
 *   <li><b>Скачать</b> выгрузку портала ({@link EmisDataSource#downloadSnapshot()}) — вне
 *       транзакции: тяжёлый HTTP не должен держать соединение пула. Если портал недоступен,
 *       админ грузит тот же SDMX-файл сам ({@link #runPriceSyncFromFile}) — конвейер общий;</li>
 *   <li><b>Положить в локальную копию</b> ({@link EmisMirrorService}): справочник целиком
 *       (CodeLists в SDMX-ответе всегда полные) и цены за окно «два последних года»;</li>
 *   <li><b>Применить цены</b> к продуктам с привязкой {@code ingredients.emis_code}
 *       ({@link EmisPriceApplier}) — они попадают в {@code ingredient_prices}, откуда их
 *       читает вся математика стоимости похода.</li>
 * </ol>
 * Ручных маппингов ({@code ingredient_mappings}/{@code external_products}) в этом пути больше
 * нет: привязка declarative и живёт на продукте, а не в отдельной сущности.
 *
 * <h3>Транзакционная модель</h3>
 * Оркестрация НЕ транзакционная; запись — короткие {@code REQUIRES_NEW}-транзакции
 * через {@link #self()} (internal call обошёл бы прокси Spring, и аннотация молча
 * игнорировалась — урок Fix-16). Чтение продуктов и цен локальной копии снимается
 * слепком plain-record'ов, поэтому в фоне нет JPA-проксей и {@code LazyInitializationException}.
 *
 * <p>Исключения наружу не выпрыгивают (метод вызывается из {@code @Async}-потока): результат
 * всегда фиксируется в {@code SyncLog} — счётчики, статус SUCCESS/PARTIAL/FAILED и
 * {@code details} (jsonb) с итогом обновления копии, постатейными строками и текстами ошибок.</p>
 */
@Service
@Slf4j
public class PriceSyncService {

    private final Map<String, EmisDataSource> sources;
    private final EmisMirrorService mirrorService;
    private final EmisCatalogService catalogService;
    private final EmisPriceApplier priceApplier;
    private final SyncLogRepository syncLogRepository;
    private final IntegrationRepository integrationRepository;
    /** Сколько последних лет храним в локальной копии (решение владельца: два года). */
    private final int periodYears;
    // Self-injection через ObjectProvider: вызов @Transactional(REQUIRES_NEW)-методов должен
    // идти через прокси Spring. ObjectProvider (а не прямой self-инжект) разрывает цикл
    // создания бина и позволяет unit-тестам конструировать сервис с null-провайдером.
    private final ObjectProvider<PriceSyncService> selfProvider;

    /** Конструктор для unit-тестов: без self-провайдера (self() == this, транзакций нет). */
    public PriceSyncService(List<EmisDataSource> sourceList,
                            EmisMirrorService mirrorService,
                            EmisCatalogService catalogService,
                            EmisPriceApplier priceApplier,
                            SyncLogRepository syncLogRepository,
                            IntegrationRepository integrationRepository,
                            int periodYears) {
        this(sourceList, mirrorService, catalogService, priceApplier, syncLogRepository,
                integrationRepository, periodYears, null);
    }

    @Autowired
    public PriceSyncService(List<EmisDataSource> sourceList,
                            EmisMirrorService mirrorService,
                            EmisCatalogService catalogService,
                            EmisPriceApplier priceApplier,
                            SyncLogRepository syncLogRepository,
                            IntegrationRepository integrationRepository,
                            @Value("${integration.rosstat.period-years:2}") int periodYears,
                            ObjectProvider<PriceSyncService> selfProvider) {
        this.sources = new HashMap<>();
        for (EmisDataSource source : sourceList) {
            this.sources.put(source.code(), source);
        }
        this.mirrorService = mirrorService;
        this.catalogService = catalogService;
        this.priceApplier = priceApplier;
        this.syncLogRepository = syncLogRepository;
        this.integrationRepository = integrationRepository;
        this.periodYears = periodYears;
        this.selfProvider = selfProvider;
        log.debug("PriceSyncService ready, источники ЕМИСС: {}, окно хранения: {} год(а)",
                this.sources.keySet(), periodYears);
    }

    /**
     * Оркестрация фонового синка. Вызывается из {@code @Async}-потока
     * ({@link IntegrationService#executePriceSync}); сам НЕ транзакционный и не асинхронный.
     *
     * @param providerCode код провайдера (= {@code integrations.provider}, например ROSSTAT)
     * @param syncLogId    id записи журнала в статусе RUNNING (создана в потоке запроса)
     */
    public void runPriceSync(String providerCode, Long syncLogId) {
        runSync(providerCode, syncLogId, null, null);
    }

    /**
     * Тот же конвейер, но слепок берётся не с портала, а из файла, который админ скачал
     * и загрузил сам («Интеграции → Загрузить файл выгрузки»). Шаг «скачать» заменяется
     * шагом «разобрать файл»; всё остальное (локальная копия → цены привязанных продуктов →
     * журнал) идентично, поэтому путь один и отчётность одна.
     *
     * @param payload  байты SDMX-файла
     * @param fileName имя файла — попадает в {@code details.mirror.snapshotSource}
     */
    public void runPriceSyncFromFile(String providerCode, Long syncLogId, byte[] payload, String fileName) {
        runSync(providerCode, syncLogId, payload, fileName);
    }

    private void runSync(String providerCode, Long syncLogId, byte[] payload, String fileName) {
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
        // Детали запуска (Fix-15): строка на каждый продукт + ошибки; всё уходит в
        // SyncLog.details (jsonb) и отображается в drawer'е журнала синков.
        List<Map<String, Object>> items = new ArrayList<>();
        List<Map<String, Object>> errorEntries = new ArrayList<>();
        Map<String, Object> mirrorDetails = null;

        try {
            EmisDataSource source = sources.get(providerCode);
            if (source == null) {
                throw new IllegalStateException("Нет источника данных ЕМИСС с кодом " + providerCode
                        + " (доступны: " + sources.keySet() + ")");
            }

            // 1) Слепок: либо внешний HTTP (ВНЕ транзакции БД), либо разбор файла админа.
            boolean fromFile = payload != null;
            requestCount = fromFile ? 0 : 1;
            EmisSnapshot snapshot = fromFile
                    ? source.parseSnapshot(payload, fileName)
                    : source.downloadSnapshot();

            // 2) Локальная копия: справочник + цены за окно «два последних года».
            EmisMirrorService.MirrorOutcome mirror =
                    mirrorService.store(snapshot, catalogService.regionCode(), periodYears);
            mirrorDetails = SyncDetailsBuilder.mirror(mirror,
                    fromFile ? "файл " + (fileName == null || fileName.isBlank() ? "без имени" : fileName)
                             : "портал " + source.code());

            // 3) Применение цен к привязанным продуктам.
            List<EmisPriceApplier.LinkedProduct> linked = priceApplier.loadLinkedProducts();
            Set<String> codes = new LinkedHashSet<>();
            for (EmisPriceApplier.LinkedProduct p : linked) {
                codes.add(p.emisCode());
            }
            Map<String, List<EmisPriceApplier.LocalPrice>> localPrices =
                    priceApplier.loadLocalPrices(mirror.regionCode(), codes);
            log.info("Price sync {}: в локальную копию уложено {} точек цен, привязанных продуктов {}",
                    providerCode, mirror.pricesUpserted(), linked.size());

            for (EmisPriceApplier.LinkedProduct product : linked) {
                try {
                    EmisPriceApplier.ProductOutcome outcome = priceApplier.apply(product,
                            localPrices.getOrDefault(product.emisCode(), List.of()), providerCode);
                    created += outcome.created();
                    updated += outcome.updated();
                    items.add(SyncDetailsBuilder.item(new SyncDetailsBuilder.Item(
                            product.ingredientId(), product.name(), product.emisCode(),
                            outcome.lastDate(), outcome.oldPrice(), outcome.newPrice(),
                            outcome.action(), outcome.reason())));
                    log.info("Продукт {} «{}» (ЕМИСС {}): {} — {}", product.ingredientId(),
                            product.name(), product.emisCode(), outcome.action(), outcome.reason());
                } catch (Exception e) {
                    errors++;
                    String message = SyncDetailsBuilder.messageOf(e);
                    log.error("Не удалось применить цены ЕМИСС к продукту {} ({}): {}",
                            product.ingredientId(), product.emisCode(), message, e);
                    errorEntries.add(SyncDetailsBuilder.error(product.emisCode(), message));
                    items.add(SyncDetailsBuilder.item(new SyncDetailsBuilder.Item(
                            product.ingredientId(), product.name(), product.emisCode(),
                            null, null, null, "ERROR", message)));
                }
            }

            self().finalizeSyncLog(syncLogId, created, updated, errors,
                    SyncDetailsBuilder.details(requestCount, items, errorEntries, null, mirrorDetails));
            log.info("Price sync finished: provider={}, syncLogId={}, created={}, updated={}, errors={}",
                    providerCode, syncLogId, created, updated, errors);

        } catch (Exception e) {
            String message = SyncDetailsBuilder.messageOf(e);
            // Фатальный сбой (портал недоступен, копия не записалась) — текст виден в drawer'е
            // (fatalError) и первой записью в errors (баннер «Последний запуск упал»).
            errorEntries.add(0, SyncDetailsBuilder.error("—", message));
            self().finalizeSyncLog(syncLogId, created, updated, errors + 1,
                    SyncDetailsBuilder.details(requestCount, items, errorEntries, message, mirrorDetails));
            log.error("Price sync failed for provider {} (syncLogId={}): {}",
                    providerCode, syncLogId, message, e);
        }
    }

    /**
     * Финализация лога и {@code last_sync_at} в отдельной короткой транзакции (фон без TX).
     *
     * <p>Статус ВЫВОДИТСЯ из счётчиков (Fix-15): errors==0 → SUCCESS; errors>0 и ничего не
     * записано → FAILED; errors>0, но работа выполнена → PARTIAL (V25 расширяет CHECK).</p>
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

        integrationRepository.findByProvider(syncLog.getProvider()).ifPresent(integration -> {
            integration.setLastSyncAt(LocalDateTime.now());
            integrationRepository.save(integration);
        });
    }

    /** Прокси Spring для REQUIRES_NEW-методов; в unit-тестах (selfProvider == null) — this. */
    private PriceSyncService self() {
        return selfProvider != null ? selfProvider.getObject() : this;
    }
}
