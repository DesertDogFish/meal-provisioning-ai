package com.provision.service;

import com.provision.dto.integration.IngredientMappingRequest;
import com.provision.entity.*;
import com.provision.exception.NotFoundException;
import com.provision.integration.ConnectionStatus;
import com.provision.integration.ExternalPriceDto;
import com.provision.integration.PriceProvider;
import com.provision.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Регрессия на баг "No enum constant com.provision.entity.RecipeSource.OFF".
 * Провайдер OpenFoodFactsProvider.code() == "IntegrationService" передаёт код "OFF"
 * в RecipeSource.valueOf(...) — OFF должен присутствовать в enum и корректно
 * обрабатываться во всех местах (маппинги, синхронизация цен).
 */
@DisplayName("OFF: enum RecipeSource + интеграция без падений")
class OffRecipeSourceTest {

    @Mock private IntegrationRepository integrationRepository;
    @Mock private ExternalProductRepository externalProductRepository;
    @Mock private IngredientMappingRepository mappingRepository;
    @Mock private IngredientPriceRepository priceRepository;
    @Mock private IngredientRepository ingredientRepository;
    @Mock private SyncLogRepository syncLogRepository;
    @Mock private UserRepository userRepository;

    private final PriceProvider offProvider = new PriceProvider() {
        @Override public String code() { return "OFF"; }
        @Override public ConnectionStatus testConnection() { return ConnectionStatus.success(); }
        @Override public List<com.provision.integration.ExternalProductDto> searchProducts(String q, int l) { return List.of(); }
        @Override public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
            return List.of(new ExternalPriceDto(externalCode, new BigDecimal("89.90"), "RUB", LocalDate.of(2026, 10, 20)));
        }
    };

    private IntegrationService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new IntegrationService(
                List.of(offProvider), integrationRepository, externalProductRepository,
                mappingRepository, priceRepository, ingredientRepository,
                syncLogRepository, userRepository);
    }

    @Test
    @DisplayName("enum RecipeSource содержит OFF (прямая проверка корня бага)")
    void enumContainsOff() {
        assertThat(RecipeSource.valueOf("OFF")).isEqualTo(RecipeSource.OFF);
    }

    @Test
    @DisplayName("syncPrices('OFF') не падает с No enum constant и сохраняет цену")
    void syncPricesWithOffDoesNotThrowEnumError() {
        Integration connected = Integration.builder()
                .id(1L).provider("OFF").status("CONNECTED").build();
        when(integrationRepository.findByProvider("OFF")).thenReturn(Optional.of(connected));
        when(syncLogRepository.findRunningByProvider("OFF")).thenReturn(Optional.empty());
        User user = User.builder().id(7L).email("admin@provision.app").build();
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        // FIX (P1, async-рефактор): syncPrices больше не держит БД-объекты в памяти —
        // фоновая часть перезагружает SyncLog по id.
        AtomicReference<SyncLog> saved = new AtomicReference<>();
        when(syncLogRepository.save(any(SyncLog.class))).thenAnswer(inv -> {
            SyncLog s = inv.getArgument(0);
            if (s.getId() == null) s.setId(100L);
            saved.set(s);
            return s;
        });
        when(syncLogRepository.findById(100L)).thenAnswer(inv -> Optional.ofNullable(saved.get()));

        Ingredient macaroni = Ingredient.builder()
                .id(11L).name("Макароны").unit(UnitOfMeasure.KG).build();
        ExternalProduct ext = ExternalProduct.builder()
                .id(5L).provider("OFF").externalCode("3013096006433")
                .packAmount(new BigDecimal("900")).packUnit("g").build();
        IngredientMapping mapping = IngredientMapping.builder()
                .id(3L).source(RecipeSource.OFF).externalCode("3013096006433")
                .internalIngredient(macaroni).externalProduct(ext).build();

        when(mappingRepository.findBySource(RecipeSource.OFF)).thenReturn(List.of(mapping));
        when(priceRepository.findByIngredientIdAndEffectiveFrom(eq(11L), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        SyncLog log = service.syncPrices("OFF", 7L);

        ArgumentCaptor<IngredientPrice> captor = ArgumentCaptor.forClass(IngredientPrice.class);
        verify(priceRepository).save(captor.capture());
        IngredientPrice saved1 = captor.getValue();
        // 89.90 ₽ за 900 г -> 99.89 ₽/KG
        assertThat(saved1.getPricePerUnit()).isEqualByComparingTo(new BigDecimal("99.89"));
        assertThat(saved1.getSource()).isEqualTo("OFF");
        assertThat(log.getStatus()).isEqualTo("SUCCESS");
        assertThat(log.getCreatedCount()).isEqualTo(1);
        // U11: анонимный провайдер НЕ реализует ProductInfoProvider —
        // карточка внешнего продукта не трогается.
        verify(externalProductRepository, never()).save(any());
    }

    @Test
    @DisplayName("createMapping с provider='OFF' проходит valueOf без исключения")
    void createMappingAcceptsOffProvider() {
        Ingredient ingredient = Ingredient.builder()
                .id(11L).name("Макароны").unit(UnitOfMeasure.KG).build();
        when(ingredientRepository.findById(11L)).thenReturn(Optional.of(ingredient));
        when(mappingRepository.findByInternalIngredientIdAndSource(11L, RecipeSource.OFF))
                .thenReturn(Optional.empty());
        when(externalProductRepository.findByProviderAndExternalCode("OFF", "3013096006433"))
                .thenReturn(Optional.empty());
        when(externalProductRepository.save(any(ExternalProduct.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        service.createMapping(11L, new IngredientMappingRequest(
                "OFF", "3013096006433", new BigDecimal("900"), "g"));

        ArgumentCaptor<IngredientMapping> captor = ArgumentCaptor.forClass(IngredientMapping.class);
        verify(mappingRepository).save(captor.capture());
        assertThat(captor.getValue().getSource()).isEqualTo(RecipeSource.OFF);
    }

    @Test
    @DisplayName("Неизвестный провайдер даёт понятную ошибку вместо 'No enum constant ...'")
    void unknownProviderGivesFriendlyError() {
        Ingredient ingredient = Ingredient.builder()
                .id(11L).name("Макароны").unit(UnitOfMeasure.KG).build();
        when(ingredientRepository.findById(11L)).thenReturn(Optional.of(ingredient));

        try {
            service.createMapping(11L, new IngredientMappingRequest(
                    "HACKER", "x", new BigDecimal("1"), "g"));
            throw new AssertionError("ожидался NotFoundException");
        } catch (NotFoundException e) {
            assertThat(e.getMessage()).contains("Неизвестный источник/провайдер: HACKER");
            assertThat(e.getMessage()).doesNotContain("No enum constant");
        }
    }

    /**
     * U11: провайдер, который умеет не только цены, но и обновление карточки
     * внешнего продукта (ProductInfoProvider). IntegrationService обязан
     * вызвать fetchProductInfo при синхронизации цен и учесть изменение
     * в SyncLog.updatedCount.
     */
    static class InfoProvider implements PriceProvider,
            com.provision.integration.ProductInfoProvider {
        @Override public String code() { return "OFF"; }
        @Override public ConnectionStatus testConnection() { return ConnectionStatus.success(); }
        @Override public List<com.provision.integration.ExternalProductDto> searchProducts(String q, int l) { return List.of(); }
        @Override public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
            return List.of(new ExternalPriceDto(externalCode, new BigDecimal("249.90"), "RUB",
                    LocalDate.of(2026, 10, 21)));
        }
        @Override public Optional<com.provision.integration.ExternalProductDto> fetchProductInfo(String externalCode) {
            return Optional.of(new com.provision.integration.ExternalProductDto(externalCode,
                    "Nutella Hazelnut Spread", "Ferrero",
                    new BigDecimal("0.350"), "KG",
                    "https://images.openfoodfacts.org/images/products/301/762/042/2003/front.jpg"));
        }
    }

    @Test
    @DisplayName("U11: синхронизация цен обновляет карточку ExternalProduct (updatedCount=1)")
    void syncPricesUpdatesProductCardForInfoProvider() {
        IntegrationService infoService = new IntegrationService(
                List.of(new InfoProvider()), integrationRepository, externalProductRepository,
                mappingRepository, priceRepository, ingredientRepository,
                syncLogRepository, userRepository);

        Integration connected = Integration.builder()
                .id(1L).provider("OFF").status("CONNECTED").build();
        when(integrationRepository.findByProvider("OFF")).thenReturn(Optional.of(connected));
        when(syncLogRepository.findRunningByProvider("OFF")).thenReturn(Optional.empty());
        User user = User.builder().id(7L).email("admin@provision.app").build();
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        AtomicReference<SyncLog> saved = new AtomicReference<>();
        when(syncLogRepository.save(any(SyncLog.class))).thenAnswer(inv -> {
            SyncLog s = inv.getArgument(0);
            if (s.getId() == null) s.setId(100L);
            saved.set(s);
            return s;
        });
        when(syncLogRepository.findById(100L)).thenAnswer(inv -> Optional.ofNullable(saved.get()));

        Ingredient nutella = Ingredient.builder()
                .id(12L).name("Нутелла").unit(UnitOfMeasure.KG).build();
        ExternalProduct ext = ExternalProduct.builder()
                .id(6L).provider("OFF").externalCode("3017620422003")
                .name("Старое название").brand("OldBrand")
                .packAmount(new BigDecimal("0.350")).packUnit("KG").build();
        IngredientMapping mapping = IngredientMapping.builder()
                .id(4L).source(RecipeSource.OFF).externalCode("3017620422003")
                .internalIngredient(nutella).externalProduct(ext).build();

        when(mappingRepository.findBySource(RecipeSource.OFF)).thenReturn(List.of(mapping));
        when(priceRepository.findByIngredientIdAndEffectiveFrom(eq(12L), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(externalProductRepository.save(any(ExternalProduct.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        SyncLog log = infoService.syncPrices("OFF", 7L);

        // Цена записана: 249.90 ₽ за 0.350 кг → 714.00 ₽/KG
        ArgumentCaptor<IngredientPrice> priceCaptor = ArgumentCaptor.forClass(IngredientPrice.class);
        verify(priceRepository).save(priceCaptor.capture());
        assertThat(priceCaptor.getValue().getPricePerUnit())
                .isEqualByComparingTo(new BigDecimal("714.00"));

        // Карточка внешнего продукта обновлена свежими данными провайдера
        verify(externalProductRepository).save(ext);
        assertThat(ext.getName()).isEqualTo("Nutella Hazelnut Spread");
        assertThat(ext.getBrand()).isEqualTo("Ferrero");
        assertThat(ext.getPackAmount()).isEqualByComparingTo(new BigDecimal("0.350"));
        assertThat(ext.getPackUnit()).isEqualTo("KG");
        assertThat(ext.getImageUrl()).contains("openfoodfacts.org");

        // Счётчики: 1 созданная цена + 1 обновлённая карточка
        assertThat(log.getStatus()).isEqualTo("SUCCESS");
        assertThat(log.getCreatedCount()).isEqualTo(1);
        assertThat(log.getUpdatedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("U11: идентичные данные карточки от провайдера → save не вызывается, updatedCount=0")
    void identicalProductCardIsNotResaved() {
        IntegrationService infoService = new IntegrationService(
                List.of(new InfoProvider()), integrationRepository, externalProductRepository,
                mappingRepository, priceRepository, ingredientRepository,
                syncLogRepository, userRepository);

        Integration connected = Integration.builder()
                .id(1L).provider("OFF").status("CONNECTED").build();
        when(integrationRepository.findByProvider("OFF")).thenReturn(Optional.of(connected));
        when(syncLogRepository.findRunningByProvider("OFF")).thenReturn(Optional.empty());
        when(userRepository.findById(7L))
                .thenReturn(Optional.of(User.builder().id(7L).email("admin@provision.app").build()));
        AtomicReference<SyncLog> saved = new AtomicReference<>();
        when(syncLogRepository.save(any(SyncLog.class))).thenAnswer(inv -> {
            SyncLog s = inv.getArgument(0);
            if (s.getId() == null) s.setId(100L);
            saved.set(s);
            return s;
        });
        when(syncLogRepository.findById(100L)).thenAnswer(inv -> Optional.ofNullable(saved.get()));

        Ingredient nutella = Ingredient.builder()
                .id(12L).name("Нутелла").unit(UnitOfMeasure.KG).build();
        // Карточка уже содержит свежие данные провайдера.
        ExternalProduct ext = ExternalProduct.builder()
                .id(6L).provider("OFF").externalCode("3017620422003")
                .name("Nutella Hazelnut Spread").brand("Ferrero")
                .packAmount(new BigDecimal("0.350")).packUnit("KG")
                .imageUrl("https://images.openfoodfacts.org/images/products/301/762/042/2003/front.jpg")
                .build();
        IngredientMapping mapping = IngredientMapping.builder()
                .id(4L).source(RecipeSource.OFF).externalCode("3017620422003")
                .internalIngredient(nutella).externalProduct(ext).build();

        when(mappingRepository.findBySource(RecipeSource.OFF)).thenReturn(List.of(mapping));
        when(priceRepository.findByIngredientIdAndEffectiveFrom(eq(12L), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        SyncLog log = infoService.syncPrices("OFF", 7L);

        verify(externalProductRepository, never()).save(any());
        assertThat(log.getStatus()).isEqualTo("SUCCESS");
        assertThat(log.getCreatedCount()).isEqualTo(1);
        assertThat(log.getUpdatedCount()).isEqualTo(0);
    }
}
