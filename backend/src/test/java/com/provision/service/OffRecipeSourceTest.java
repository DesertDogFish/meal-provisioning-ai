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
        when(syncLogRepository.save(any(SyncLog.class))).thenAnswer(inv -> {
            SyncLog s = inv.getArgument(0);
            if (s.getId() == null) s.setId(100L);
            return s;
        });

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
        IngredientPrice saved = captor.getValue();
        // 89.90 ₽ за 900 г -> 99.89 ₽/KG
        assertThat(saved.getPricePerUnit()).isEqualByComparingTo(new BigDecimal("99.89"));
        assertThat(saved.getSource()).isEqualTo("OFF");
        assertThat(log.getStatus()).isEqualTo("SUCCESS");
        assertThat(log.getCreatedCount()).isEqualTo(1);
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
}
