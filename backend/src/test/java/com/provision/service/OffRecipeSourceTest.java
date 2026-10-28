package com.provision.service;

import com.provision.dto.integration.IngredientBindingDto;
import com.provision.dto.integration.IngredientMappingRequest;
import com.provision.entity.*;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.integration.ConnectionStatus;
import com.provision.integration.ExternalPriceDto;
import com.provision.integration.ExternalProductDto;
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
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Регрессия на баг "No enum constant com.provision.entity.RecipeSource.OFF".
 * Код провайдера (исторически "OFF", с Fix-13 — "ROSSTAT") передаётся в
 * RecipeSource.valueOf(...) — значение обязано присутствовать в enum и
 * корректно обрабатываться во всех местах (маппинги, синхронизация цен).
 * OFF сохранён в enum для legacy-строк БД (провайдер демонтирован в Fix-13).
 *
 * <p>Fix-16: сценарии самой синхронизации цен переехали в {@link PriceSyncServiceTest}
 * (вместе с логикой — в {@link PriceSyncService}); здесь остались проверки
 * {@link IntegrationService}: enum, createMapping, запуск фонового синка и его защитные проверки.</p>
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
    @Mock private ExternalProductCardService cardService;
    @Mock private PriceSyncService priceSyncService;

    private final PriceProvider offProvider = new PriceProvider() {
        @Override public String code() { return "OFF"; }
        @Override public ConnectionStatus testConnection() { return ConnectionStatus.success(); }
        @Override public List<ExternalProductDto> searchProducts(String q, int l) { return List.of(); }
        @Override public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
            return List.of(new ExternalPriceDto(externalCode, new BigDecimal("89.90"), "RUB",
                    LocalDate.of(2026, 10, 20)));
        }
    };

    private IntegrationService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new IntegrationService(
                List.of(offProvider), integrationRepository, externalProductRepository,
                mappingRepository, ingredientRepository, syncLogRepository, userRepository,
                priceSyncService);
    }

    @Test
    @DisplayName("enum RecipeSource содержит OFF (legacy) и ROSSTAT (Fix-13)")
    void enumContainsOff() {
        assertThat(RecipeSource.valueOf("OFF")).isEqualTo(RecipeSource.OFF);
        // Fix-13: провайдер Росстата — code() "ROSSTAT" → mappingSourceOrNull
        // не должен возвращать null (иначе синхронизация цен синхронизирует 0).
        assertThat(RecipeSource.valueOf("ROSSTAT")).isEqualTo(RecipeSource.ROSSTAT);
    }

    @Test
    @DisplayName("syncPrices('OFF') создаёт RUNNING-лог и отдаёт синк в фон (PriceSyncService)")
    void syncPricesCreatesRunningLogAndDelegatesToBackground() {
        when(integrationRepository.findByProvider("OFF")).thenReturn(Optional.of(
                Integration.builder().id(1L).provider("OFF").status("CONNECTED").build()));
        when(syncLogRepository.findRunningByProvider("OFF")).thenReturn(Optional.empty());
        when(userRepository.findById(7L))
                .thenReturn(Optional.of(User.builder().id(7L).email("admin@provision.app").build()));
        when(syncLogRepository.save(any(SyncLog.class))).thenAnswer(inv -> {
            SyncLog s = inv.getArgument(0);
            if (s.getId() == null) s.setId(100L);
            return s;
        });

        SyncLog log = service.syncPrices("OFF", 7L);

        // Контроллер отвечает 202 + logId; тяжёлая часть уходит в фон.
        assertThat(log.getId()).isEqualTo(100L);
        assertThat(log.getStatus()).isEqualTo("RUNNING");
        assertThat(log.getProvider()).isEqualTo("OFF");
        assertThat(log.getType()).isEqualTo("PRICES");
        assertThat(log.getTriggeredBy()).isEqualTo("MANUAL");
        assertThat(log.getStartedAt()).isNotNull();
        verify(priceSyncService).runPriceSync("OFF", 100L);
    }

    @Test
    @DisplayName("syncPrices: провайдер не подключён → ConflictException, синк не запускается")
    void syncPricesRequiresConnectedIntegration() {
        when(integrationRepository.findByProvider("OFF")).thenReturn(Optional.of(
                Integration.builder().id(1L).provider("OFF").status("ERROR").build()));

        assertThatThrownBy(() -> service.syncPrices("OFF", 7L))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("INTEGRATION_DISCONNECTED");
        verify(priceSyncService, never()).runPriceSync(any(), any());
        verify(syncLogRepository, never()).save(any());
    }

    @Test
    @DisplayName("syncPrices: параллельный запуск → ConflictException (журнал не плодится)")
    void syncPricesRejectsConcurrentRun() {
        when(integrationRepository.findByProvider("OFF")).thenReturn(Optional.of(
                Integration.builder().id(1L).provider("OFF").status("CONNECTED").build()));
        when(syncLogRepository.findRunningByProvider("OFF")).thenReturn(Optional.of(
                SyncLog.builder().id(9L).provider("OFF").type("PRICES").status("RUNNING")
                        .startedAt(LocalDateTime.now()).build()));

        assertThatThrownBy(() -> service.syncPrices("OFF", 7L))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("SYNC_ALREADY_RUNNING");
        verify(priceSyncService, never()).runPriceSync(any(), any());
    }

    @Test
    @DisplayName("executePriceSync — тонкая @Async-граница: всё делегируется PriceSyncService")
    void executePriceSyncDelegates() {
        service.executePriceSync("ROSSTAT", 42L);

        verify(priceSyncService).runPriceSync("ROSSTAT", 42L);
        verifyNoInteractions(mappingRepository);
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

        IngredientBindingDto binding = service.createMapping(11L, new IngredientMappingRequest(
                "OFF", "3013096006433", new BigDecimal("900"), "g"));

        ArgumentCaptor<IngredientMapping> captor = ArgumentCaptor.forClass(IngredientMapping.class);
        verify(mappingRepository).save(captor.capture());
        assertThat(captor.getValue().getSource()).isEqualTo(RecipeSource.OFF);
        // Fix-15: ответ не пустой — фронтенд парсит тело и обновляет «Текущие привязки».
        assertThat(binding.ingredientId()).isEqualTo(11L);
        assertThat(binding.externalCode()).isEqualTo("3013096006433");
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

    @Test
    @DisplayName("getMappings: код провайдера парсит PriceSyncService (единая точка)")
    void getMappingsUsesPriceSyncServiceForSourceParsing() {
        when(priceSyncService.mappingSourceOrNull("ROSSTAT")).thenReturn(RecipeSource.ROSSTAT);
        when(mappingRepository.findBySourceWithIngredients(RecipeSource.ROSSTAT)).thenReturn(List.of(
                IngredientMapping.builder().id(99L).source(RecipeSource.ROSSTAT)
                        .externalCode("1743453").externalName("Апельсины")
                        .internalIngredient(Ingredient.builder().id(5L).name("Апельсины").build())
                        .externalProduct(ExternalProduct.builder().id(1L).provider("ROSSTAT")
                                .externalCode("1743453").packUnit("KG").build())
                        .createdAt(LocalDateTime.now()).build()));

        List<IngredientBindingDto> bindings = service.getMappings("ROSSTAT");

        assertThat(bindings).singleElement().satisfies(b -> {
            assertThat(b.mappingId()).isEqualTo(99L);
            assertThat(b.ingredientName()).isEqualTo("Апельсины");
            assertThat(b.packUnit()).isEqualTo("KG");
        });
    }
}
