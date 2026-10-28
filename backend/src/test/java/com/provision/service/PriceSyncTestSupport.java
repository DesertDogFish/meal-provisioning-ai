package com.provision.service;

import com.provision.entity.ExternalProduct;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientMapping;
import com.provision.entity.RecipeSource;
import com.provision.entity.SyncLog;
import com.provision.entity.UnitOfMeasure;
import com.provision.integration.ConnectionStatus;
import com.provision.integration.ExternalPriceDto;
import com.provision.integration.ExternalProductDto;
import com.provision.integration.PriceProvider;
import com.provision.repository.ExternalProductRepository;
import com.provision.repository.IngredientMappingRepository;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.IngredientRepository;
import com.provision.repository.IntegrationRepository;
import com.provision.repository.SyncLogRepository;
import org.hibernate.LazyInitializationException;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.beans.factory.ObjectProvider;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

/**
 * Общая оснастка тестов {@link PriceSyncService} (Fix-16): «ленивые прокси» +
 * модель БД-сессии + фабрики маппингов/провайдеров.
 *
 * <h3>Зачем это нужно</h3>
 * Прод-баг владельца (Запуск #10 · PRICES, 28.10.2026): фоновый синк цен читал
 * LAZY-ассоциации {@code IngredientMapping} вне БД-сессии и падал с
 * {@code org.hibernate.LazyInitializationException: could not initialize proxy
 * [com.provision.entity.Ingredient#160] - no Session}. Mockito-моки такую ошибку
 * не воспроизводят (у них нет проксей), поэтому здесь — настоящие subclass'ы
 * сущностей, бросающие тот же {@link LazyInitializationException} с тем же текстом,
 * если геттер вызван при закрытой «сессии».
 *
 * <h3>Как моделируется сессия</h3>
 * Флаг {@link #SESSION_OPEN} поднимается ТОЛЬКО на время вызова
 * {@code @Transactional}-методов сервиса: в тесте их перехватывает spy на self-прокси
 * ({@code ObjectProvider}) — ровно как Spring-прокси в бою. Отсюда проверяемое
 * свойство: читать сущности можно лишь внутри короткой транзакции
 * ({@code loadPriceSyncTargets}, {@code applyMappingPricesInTx}, {@code finalizeSyncLog}),
 * а между транзакциями код обязан работать со слепком {@code PriceSyncTarget}.
 *
 * <p>Red-проверка оснастки: если вернуть прежнее поведение (читать маппинги напрямую
 * из репозитория и дёргать {@code mapping.getInternalIngredient().getName()} в цикле),
 * сценарии в {@link PriceSyncServiceTest} и {@link PriceSyncServiceFailureTest} падают
 * с прод-текстом «no Session» (проверено: 11 падений).</p>
 */
abstract class PriceSyncTestSupport {

    protected static final long SYNC_LOG_ID = 100L;

    /** Открыта ли сейчас БД-сессия (флаг вокруг @Transactional-методов). */
    protected static final AtomicBoolean SESSION_OPEN = new AtomicBoolean(false);

    @Mock protected IngredientMappingRepository mappingRepository;
    @Mock protected IngredientRepository ingredientRepository;
    @Mock protected ExternalProductRepository externalProductRepository;
    @Mock protected IngredientPriceRepository priceRepository;
    @Mock protected SyncLogRepository syncLogRepository;
    @Mock protected IntegrationRepository integrationRepository;
    @Mock protected ExternalProductCardService cardService;
    @Mock protected ObjectProvider<PriceSyncService> selfProvider;

    /** Запись журнала, в которую синк пишет статус/счётчики/details. */
    protected SyncLog syncLog;

    @BeforeEach
    void setUpSession() {
        MockitoAnnotations.openMocks(this);
        SESSION_OPEN.set(false);

        syncLog = SyncLog.builder()
                .id(SYNC_LOG_ID).provider("ROSSTAT").type("PRICES").status("RUNNING")
                .triggeredBy("MANUAL").startedAt(LocalDateTime.now().minusSeconds(1))
                .createdCount(0).updatedCount(0).errorCount(0)
                .build();
        when(syncLogRepository.findById(SYNC_LOG_ID)).thenReturn(Optional.of(syncLog));
        when(syncLogRepository.save(any(SyncLog.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(integrationRepository.findByProvider(any())).thenReturn(Optional.empty());
    }

    // ---- фабрика сервиса: self-прокси открывает «сессию» на @Transactional-методах ----

    protected PriceSyncService service(PriceProvider provider) {
        PriceSyncService raw = new PriceSyncService(
                List.of(provider), mappingRepository, ingredientRepository, externalProductRepository,
                priceRepository, syncLogRepository, integrationRepository, cardService, selfProvider);
        PriceSyncService self = spy(raw);
        when(selfProvider.getObject()).thenReturn(self);
        doAnswer(inv -> inSession(() -> inv.callRealMethod())).when(self).loadPriceSyncTargets(any());
        doAnswer(inv -> inSession(() -> inv.callRealMethod()))
                .when(self).applyMappingPricesInTx(any(), any(), any());
        doAnswer(inv -> inSession(() -> inv.callRealMethod()))
                .when(self).finalizeSyncLog(anyLong(), anyInt(), anyInt(), anyInt(), any());
        return raw;
    }

    private static Object inSession(ThrowableSupplier call) throws Throwable {
        SESSION_OPEN.set(true);
        try {
            return call.get();
        } finally {
            SESSION_OPEN.set(false);
        }
    }

    @FunctionalInterface
    private interface ThrowableSupplier {
        Object get() throws Throwable;
    }

    // ---- фабрики данных ----

    /** Маппинг с «ленивыми» ассоциациями — как в БД после закрытия сессии. */
    protected IngredientMapping mapping(long mappingId, String externalCode,
                                        Ingredient ingredient, ExternalProduct product) {
        return IngredientMapping.builder()
                .id(mappingId).source(RecipeSource.ROSSTAT)
                .externalCode(externalCode).externalName("внешнее имя")
                .internalIngredient(ingredient).externalProduct(product)
                .createdAt(LocalDateTime.now())
                .build();
    }

    protected void givenMappings(IngredientMapping... mappings) {
        when(mappingRepository.findBySourceWithIngredientAndProduct(RecipeSource.ROSSTAT))
                .thenReturn(List.of(mappings));
    }

    /** Управляемые (найденные по id внутри транзакции) сущности. */
    protected void givenManaged(long ingredientId, String name, UnitOfMeasure unit,
                                long productId, String packAmount, String packUnit) {
        when(ingredientRepository.findById(ingredientId))
                .thenReturn(Optional.of(Ingredient.builder()
                        .id(ingredientId).name(name).unit(unit).build()));
        givenManagedProduct(productId, packAmount, packUnit);
    }

    protected void givenManagedProduct(long productId, String packAmount, String packUnit) {
        when(externalProductRepository.findById(productId))
                .thenReturn(Optional.of(ExternalProduct.builder()
                        .id(productId).provider("ROSSTAT").externalCode("1743453")
                        .name("Апельсины, кг")
                        .packAmount(new BigDecimal(packAmount)).packUnit(packUnit).build()));
    }

    protected static PriceProvider provider(String code, List<ExternalPriceDto> prices) {
        return new PriceProvider() {
            @Override public String code() { return code; }
            @Override public ConnectionStatus testConnection() { return ConnectionStatus.success(); }
            @Override public List<ExternalProductDto> searchProducts(String q, int l) { return List.of(); }
            @Override public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
                return prices;
            }
        };
    }

    protected static PriceProvider failingProvider(String code, RuntimeException error) {
        return new PriceProvider() {
            @Override public String code() { return code; }
            @Override public ConnectionStatus testConnection() { return ConnectionStatus.success(); }
            @Override public List<ExternalProductDto> searchProducts(String q, int l) { return List.of(); }
            @Override public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
                throw error;
            }
        };
    }

    /** Провайдер ЕМИСС-подобный: и цены, и данные карточки (ProductInfoProvider). */
    protected static class CombinedProvider implements PriceProvider,
            com.provision.integration.ProductInfoProvider {
        @Override public String code() { return "ROSSTAT"; }
        @Override public ConnectionStatus testConnection() { return ConnectionStatus.success(); }
        @Override public List<ExternalProductDto> searchProducts(String q, int l) { return List.of(); }
        @Override public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
            return List.of(new ExternalPriceDto(externalCode, new BigDecimal("120.00"), "RUB",
                    LocalDate.of(2026, 9, 30)));
        }
        @Override public Optional<ExternalProductDto> fetchProductInfo(String externalCode) {
            return Optional.of(new ExternalProductDto(externalCode, "Бананы, кг", "Росстат",
                    BigDecimal.ONE, "KG", null));
        }
    }

    // ---- доступ к деталям журнала ----

    @SuppressWarnings("unchecked")
    protected List<Map<String, Object>> items() {
        return (List<Map<String, Object>>) syncLog.getDetails().get("items");
    }

    @SuppressWarnings("unchecked")
    protected List<Map<String, Object>> errorEntries() {
        return (List<Map<String, Object>>) syncLog.getDetails().get("errors");
    }

    // ---- «ленивые прокси»: геттер вне сессии = прод-ошибка ----

    protected static class LazyIngredient extends Ingredient {
        private final Long pk;
        protected LazyIngredient(Long id, String name, UnitOfMeasure unit) {
            this.pk = id;
            setId(id); setName(name); setUnit(unit);
        }
        @Override public Long getId() { requireSession(); return super.getId(); }
        @Override public String getName() { requireSession(); return super.getName(); }
        @Override public UnitOfMeasure getUnit() { requireSession(); return super.getUnit(); }
        private void requireSession() {
            if (!SESSION_OPEN.get()) {
                throw new LazyInitializationException(
                        "could not initialize proxy [com.provision.entity.Ingredient#" + pk + "] - no Session");
            }
        }
    }

    protected static class LazyExternalProduct extends ExternalProduct {
        private final Long pk;
        protected LazyExternalProduct(Long id, String packAmount, String packUnit) {
            this.pk = id;
            setId(id); setProvider("ROSSTAT"); setExternalCode("1743453"); setName("Апельсины, кг");
            setPackAmount(new BigDecimal(packAmount)); setPackUnit(packUnit);
        }
        @Override public Long getId() { requireSession(); return super.getId(); }
        @Override public BigDecimal getPackAmount() { requireSession(); return super.getPackAmount(); }
        @Override public String getPackUnit() { requireSession(); return super.getPackUnit(); }
        private void requireSession() {
            if (!SESSION_OPEN.get()) {
                throw new LazyInitializationException(
                        "could not initialize proxy [com.provision.entity.ExternalProduct#" + pk + "] - no Session");
            }
        }
    }
}
