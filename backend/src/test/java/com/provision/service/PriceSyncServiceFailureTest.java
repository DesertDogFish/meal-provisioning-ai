package com.provision.service;

import com.provision.entity.ExternalProduct;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.entity.UnitOfMeasure;
import com.provision.integration.ExternalPriceDto;
import com.provision.integration.ExternalProductDto;
import com.provision.integration.PriceProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Fix-16: отказы и пропуски фонового синка цен.
 *
 * <p>Боль владельца из Fix-15 («какой же это успех, когда Ошибки 2», «где детали ошибок?»,
 * «Постатейных данных нет») закрывается здесь: каждый сбой обязан попасть в
 * {@code SyncLog.details} постатейно и влиять на статус (SUCCESS/PARTIAL/FAILED),
 * а синк не имеет права падать целиком из-за одного маппинга.</p>
 *
 * <p>Оснастка и модель БД-сессии — в {@link PriceSyncTestSupport};
 * успешные сценарии — в {@link PriceSyncServiceTest}.</p>
 */
@DisplayName("Fix-16: PriceSyncService — отказы, пропуски и честные статусы")
class PriceSyncServiceFailureTest extends PriceSyncTestSupport {

    @Test
    @DisplayName("SYNC-03: провайдер недоступен → ошибка видна в деталях, статус FAILED")
    void providerFailureIsReportedInDetails() {
        Ingredient ingredient = new LazyIngredient(162L, "Гречка", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(6L, "1", "KG");
        givenMappings(mapping(5L, "1743500", ingredient, product));

        service(failingProvider("ROSSTAT", new IllegalStateException(
                "ЕМИСС вернул 403: выгрузка недоступна")))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("FAILED");
        assertThat(syncLog.getErrorCount()).isEqualTo(1);
        assertThat(syncLog.getCreatedCount()).isZero();
        assertThat(syncLog.getDetails()).containsEntry("requestCount", 1);
        assertThat(items()).singleElement().satisfies(item ->
                assertThat(item).containsEntry("action", "ERROR")
                        .containsEntry("productName", "Гречка"));
        assertThat(errorEntries()).hasSize(1);
        assertThat(errorEntries().get(0))
                .containsEntry("externalCode", "1743500")
                .containsEntry("message", "ЕМИСС вернул 403: выгрузка недоступна");
        assertThat(syncLog.getDetails()).doesNotContainKey("fatalError");
        verify(priceRepository, never()).save(any());
    }

    @Test
    @DisplayName("SYNC-04: часть маппингов упала, часть записана → PARTIAL и постатейные детали")
    void mixedOutcomeIsPartial() {
        givenMappings(
                mapping(6L, "1743600", new LazyIngredient(163L, "Сахар", UnitOfMeasure.KG),
                        new LazyExternalProduct(7L, "1", "KG")),
                mapping(7L, "1743700", new LazyIngredient(164L, "Соль", UnitOfMeasure.KG),
                        new LazyExternalProduct(8L, "1", "KG")));
        givenManaged(163L, "Сахар", UnitOfMeasure.KG, 7L, "1", "KG");
        when(ingredientRepository.findById(164L)).thenReturn(Optional.of(
                Ingredient.builder().id(164L).name("Соль").unit(UnitOfMeasure.KG).build()));
        givenManagedProduct(8L, "1", "KG");
        when(priceRepository.findByIngredientIdAndEffectiveFrom(anyLong(), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class))).thenAnswer(inv -> inv.getArgument(0));

        PriceProvider halfBroken = new PriceProvider() {
            @Override public String code() { return "ROSSTAT"; }
            @Override public com.provision.integration.ConnectionStatus testConnection() {
                return com.provision.integration.ConnectionStatus.success();
            }
            @Override public List<ExternalProductDto> searchProducts(String q, int l) { return List.of(); }
            @Override public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
                if ("1743700".equals(externalCode)) throw new IllegalStateException("нет данных ЕМИСС");
                return List.of(new ExternalPriceDto(externalCode, new BigDecimal("70.00"), "RUB",
                        LocalDate.of(2026, 9, 30)));
            }
        };

        service(halfBroken).runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("PARTIAL");
        assertThat(syncLog.getCreatedCount()).isEqualTo(1);
        assertThat(syncLog.getErrorCount()).isEqualTo(1);
        assertThat(items()).hasSize(2);
        assertThat(items().get(0)).containsEntry("action", "CREATED").containsEntry("productName", "Сахар");
        assertThat(items().get(1)).containsEntry("action", "ERROR").containsEntry("productName", "Соль");
        assertThat(errorEntries()).hasSize(1);
        assertThat(errorEntries().get(0)).containsEntry("message", "нет данных ЕМИСС");
    }

    @Test
    @DisplayName("SYNC-02: маппинг без карточки внешнего продукта → SKIPPED с причиной, без запроса к источнику")
    void mappingWithoutProductCardIsSkipped() {
        Ingredient ingredient = new LazyIngredient(161L, "Молоко", UnitOfMeasure.L);
        givenMappings(mapping(4L, "1745000", ingredient, null));
        when(ingredientRepository.findById(161L)).thenReturn(Optional.of(
                Ingredient.builder().id(161L).name("Молоко").unit(UnitOfMeasure.L).build()));

        service(provider("ROSSTAT", List.of())).runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(syncLog.getDetails()).containsEntry("requestCount", 0);
        assertThat(items()).singleElement().satisfies(item ->
                assertThat(item).containsEntry("action", "SKIPPED")
                        .containsEntry("productName", "Молоко")
                        .containsEntry("reason", "Нет карточки внешнего продукта"));
        verify(priceRepository, never()).save(any());
    }

    @Test
    @DisplayName("SYNC-05: провайдер не является источником рецептов → 0 маппингов, SUCCESS без запросов")
    void providerWithoutMappingsSyncsZero() {
        service(provider("RATES", List.of())).runPriceSync("RATES", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(syncLog.getDetails()).containsEntry("requestCount", 0);
        assertThat(items()).isEmpty();
        verify(mappingRepository, never()).findBySourceWithIngredientAndProduct(any());
    }

    @Test
    @DisplayName("SYNC-06: неизвестный код провайдера → fatalError вместо голого NPE")
    void unknownProviderIsFatalWithClearMessage() {
        service(provider("ROSSTAT", List.of())).runPriceSync("NO_SUCH_PROVIDER", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("FAILED");
        assertThat(syncLog.getErrorCount()).isEqualTo(1);
        assertThat((String) syncLog.getDetails().get("fatalError"))
                .contains("Нет провайдера цен с кодом NO_SUCH_PROVIDER");
        assertThat(errorEntries().get(0)).containsEntry("externalCode", "—");
    }

    @Test
    @DisplayName("SYNC-07: ручная цена не перезаписывается → SKIPPED_MANUAL и защита в reason")
    void manualPriceIsProtected() {
        Ingredient ingredient = new LazyIngredient(165L, "Тушёнка", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(9L, "1", "KG");
        givenMappings(mapping(8L, "1743800", ingredient, product));
        givenManaged(165L, "Тушёнка", UnitOfMeasure.KG, 9L, "1", "KG");
        IngredientPrice manual = IngredientPrice.builder()
                .ingredient(Ingredient.builder().id(165L).build())
                .pricePerUnit(new BigDecimal("450.00")).currency("RUB")
                .effectiveFrom(LocalDate.of(2026, 9, 30)).source("MANUAL").build();
        when(priceRepository.findByIngredientIdAndEffectiveFrom(165L, LocalDate.of(2026, 9, 30)))
                .thenReturn(Optional.of(manual));

        service(provider("ROSSTAT", List.of(new ExternalPriceDto("1743800",
                new BigDecimal("300.00"), "RUB", LocalDate.of(2026, 9, 30)))))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        verify(priceRepository, never()).save(any());
        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(syncLog.getUpdatedCount()).isZero();
        assertThat(items()).singleElement().satisfies(item ->
                assertThat(item).containsEntry("action", "SKIPPED_MANUAL")
                        .containsEntry("newPrice", null));
        assertThat((String) items().get(0).get("reason")).contains("защищено ручных цен: 1");
        assertThat(manual.getPricePerUnit()).isEqualByComparingTo("450.00");
    }

    @Test
    @DisplayName("SYNC-08: не-RUB и несовместимые единицы отбрасываются, точка не пишется")
    void invalidPricePointsAreSkipped() {
        Ingredient ingredient = new LazyIngredient(166L, "Крупа", UnitOfMeasure.PCS);
        ExternalProduct product = new LazyExternalProduct(10L, "1", "KG");
        givenMappings(mapping(9L, "1743900", ingredient, product));
        givenManaged(166L, "Крупа", UnitOfMeasure.PCS, 10L, "1", "KG");

        service(provider("ROSSTAT", List.of(
                new ExternalPriceDto("1743900", new BigDecimal("10.00"), "USD", LocalDate.of(2026, 9, 30)),
                new ExternalPriceDto("1743900", new BigDecimal("12.00"), "RUB", LocalDate.of(2026, 9, 30)))))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        verify(priceRepository, never()).save(any());
        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(items()).singleElement().satisfies(item ->
                assertThat(item).containsEntry("action", "SKIPPED"));
        assertThat((String) items().get(0).get("reason")).contains("отброшено (валюта/единицы): 2");
    }

    @Test
    @DisplayName("SYNC-09: SyncLog пропал → синк не пишет ничего и не падает")
    void vanishedSyncLogAbortsQuietly() {
        when(syncLogRepository.findById(999L)).thenReturn(Optional.empty());

        service(provider("ROSSTAT", List.of())).runPriceSync("ROSSTAT", 999L);

        verify(mappingRepository, never()).findBySourceWithIngredientAndProduct(any());
        verify(syncLogRepository, never()).save(any());
    }

    @Test
    @DisplayName("SYNC-10: внутренний продукт исчез между снимком и записью → SKIPPED с причиной")
    void vanishedIngredientIsSkipped() {
        Ingredient ingredient = new LazyIngredient(167L, "Призрак", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(11L, "1", "KG");
        givenMappings(mapping(10L, "1744000", ingredient, product));
        when(ingredientRepository.findById(167L)).thenReturn(Optional.empty());

        service(provider("ROSSTAT", List.of(new ExternalPriceDto("1744000",
                new BigDecimal("10.00"), "RUB", LocalDate.of(2026, 9, 30)))))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        verify(priceRepository, never()).save(any());
        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(items()).singleElement().satisfies(item ->
                assertThat(item).containsEntry("action", "SKIPPED"));
        assertThat((String) items().get(0).get("reason")).contains("Внутренний продукт не найден (id 167)");
    }

    @Test
    @DisplayName("SYNC-12: сбой обновления карточки не роняет синк (цены уже записаны)")
    void cardRefreshFailureDoesNotBreakSync() {
        Ingredient ingredient = new LazyIngredient(169L, "Масло", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(13L, "1", "KG");
        givenMappings(mapping(12L, "1744100", ingredient, product));
        givenManaged(169L, "Масло", UnitOfMeasure.KG, 13L, "1", "KG");
        when(priceRepository.findByIngredientIdAndEffectiveFrom(anyLong(), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class))).thenAnswer(inv -> inv.getArgument(0));
        when(cardService.refresh(anyLong(), any())).thenThrow(new IllegalStateException("ЕМИСС 500"));

        service(new CombinedProvider()).runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(syncLog.getCreatedCount()).isEqualTo(1);
        assertThat(syncLog.getErrorCount()).isZero();
        assertThat(items()).singleElement().satisfies(item ->
                assertThat(item).containsEntry("action", "CREATED"));
    }

    @Test
    @DisplayName("SYNC-15: карточка внешнего продукта исчезла → SKIPPED, цены не пишутся")
    void vanishedExternalProductIsSkipped() {
        Ingredient ingredient = new LazyIngredient(172L, "Кофе", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(16L, "1", "KG");
        givenMappings(mapping(15L, "1744600", ingredient, product));
        when(ingredientRepository.findById(172L)).thenReturn(Optional.of(
                Ingredient.builder().id(172L).name("Кофе").unit(UnitOfMeasure.KG).build()));
        when(externalProductRepository.findById(16L)).thenReturn(Optional.empty());

        service(provider("ROSSTAT", List.of(new ExternalPriceDto("1744600",
                new BigDecimal("900.00"), "RUB", LocalDate.of(2026, 9, 30)))))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        verify(priceRepository, never()).save(any());
        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat((String) items().get(0).get("reason"))
                .contains("Карточка внешнего продукта не найдена (id 16)");
    }

    @Test
    @DisplayName("SYNC-16: пустая выгрузка провайдера → SKIPPED «нет данных о ценах», без ошибок")
    void emptyPriceListIsSkipped() {
        Ingredient ingredient = new LazyIngredient(173L, "Чай", UnitOfMeasure.PACK);
        ExternalProduct product = new LazyExternalProduct(17L, "1", "PACK");
        givenMappings(mapping(16L, "1744700", ingredient, product));

        service(provider("ROSSTAT", List.of())).runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(syncLog.getErrorCount()).isZero();
        assertThat(syncLog.getDetails()).containsEntry("requestCount", 1);
        assertThat(items()).singleElement().satisfies(item ->
                assertThat(item).containsEntry("action", "SKIPPED")
                        .containsEntry("reason", "У категории нет данных о ценах в выгрузке"));
        verify(priceRepository, never()).save(any());
    }

    @Test
    @DisplayName("SYNC-17: исключение без message → в деталях имя класса, а не null")
    void errorWithoutMessageFallsBackToClassName() {
        Ingredient ingredient = new LazyIngredient(174L, "Какао", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(18L, "1", "KG");
        givenMappings(mapping(17L, "1744800", ingredient, product));

        service(failingProvider("ROSSTAT", new IllegalStateException()))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("FAILED");
        assertThat(errorEntries().get(0)).containsEntry("message", "IllegalStateException");
        assertThat(items().get(0)).containsEntry("action", "ERROR");
    }
}
