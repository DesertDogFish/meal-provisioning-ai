package com.provision.service;

import com.provision.entity.ExternalProduct;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.entity.RecipeSource;
import com.provision.entity.UnitOfMeasure;
import com.provision.integration.ExternalPriceDto;
import com.provision.integration.ExternalProductDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Fix-16: успешные сценарии фонового синка цен — ядро регрессии на
 * {@code LazyInitializationException: … no Session} (Запуск #10 · PRICES, 28.10.2026).
 *
 * <p>Оснастка (модель БД-сессии и «ленивые прокси») — в {@link PriceSyncTestSupport};
 * сценарии отказов и пропусков — в {@link PriceSyncServiceFailureTest}.</p>
 */
@DisplayName("Fix-16: PriceSyncService — синк цен вне БД-сессии (успешные сценарии)")
class PriceSyncServiceTest extends PriceSyncTestSupport {

    @Test
    @DisplayName("SYNC-01 (баг владельца): ленивые маппинги вне сессии → цена записана, статус SUCCESS")
    void lazyMappingsAreReadInsideTransactionOnly() {
        // Ровно прод-ситуация: маппинг #3, ингредиент #160 «Апельсины» (KG),
        // карточка внешнего продукта 1 KG, цена ЕМИСС 89.90 ₽.
        Ingredient ingredient = new LazyIngredient(160L, "Апельсины", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(5L, "1", "KG");
        givenMappings(mapping(3L, "1743453", ingredient, product));
        givenManaged(160L, "Апельсины", UnitOfMeasure.KG, 5L, "1", "KG");
        when(priceRepository.findByIngredientIdAndEffectiveFrom(eq(160L), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class))).thenAnswer(inv -> inv.getArgument(0));

        PriceSyncService service = service(provider("ROSSTAT", List.of(
                new ExternalPriceDto("1743453", new BigDecimal("89.90"), "RUB", LocalDate.of(2026, 9, 30)))));

        // До фикса здесь вылетал LazyInitializationException «no Session» (см. PriceSyncTestSupport).
        service.runPriceSync("ROSSTAT", SYNC_LOG_ID);

        ArgumentCaptor<IngredientPrice> captor = ArgumentCaptor.forClass(IngredientPrice.class);
        verify(priceRepository).save(captor.capture());
        assertThat(captor.getValue().getPricePerUnit()).isEqualByComparingTo("89.90");
        assertThat(captor.getValue().getIngredient().getId()).isEqualTo(160L);
        assertThat(captor.getValue().getSource()).isEqualTo("ROSSTAT");

        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(syncLog.getCreatedCount()).isEqualTo(1);
        assertThat(syncLog.getErrorCount()).isZero();
        assertThat(syncLog.getFinishedAt()).isNotNull();
        assertThat(syncLog.getDetails()).containsEntry("requestCount", 1);
        assertThat(items()).singleElement().satisfies(item -> {
            assertThat(item).containsEntry("productId", 160L)
                    .containsEntry("productName", "Апельсины")
                    .containsEntry("externalCode", "1743453")
                    .containsEntry("action", "CREATED")
                    .containsEntry("priceDate", "2026-09-30");
            assertThat((Double) item.get("newPrice")).isEqualTo(89.90);
            assertThat((String) item.get("reason")).contains("Точек цен: 1", "создано: 1");
        });
    }

    @Test
    @DisplayName("SYNC-13: фасовка 900 г при единице KG → цена за кг (89.90 ₽ → 99.89 ₽)")
    void packPriceIsConvertedToUnitPrice() {
        Ingredient ingredient = new LazyIngredient(170L, "Макароны", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(14L, "900", "G");
        givenMappings(mapping(13L, "1744200", ingredient, product));
        givenManaged(170L, "Макароны", UnitOfMeasure.KG, 14L, "900", "G");
        when(priceRepository.findByIngredientIdAndEffectiveFrom(eq(170L), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class))).thenAnswer(inv -> inv.getArgument(0));

        service(provider("ROSSTAT", List.of(new ExternalPriceDto("1744200",
                new BigDecimal("89.90"), "RUB", LocalDate.of(2026, 9, 30)))))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        ArgumentCaptor<IngredientPrice> captor = ArgumentCaptor.forClass(IngredientPrice.class);
        verify(priceRepository).save(captor.capture());
        assertThat(captor.getValue().getPricePerUnit()).isEqualByComparingTo("99.89");
        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
    }

    @Test
    @DisplayName("SYNC-14: существующая цена провайдера обновляется → UPDATED со старой ценой в деталях")
    void existingProviderPriceIsUpdated() {
        Ingredient ingredient = new LazyIngredient(171L, "Рис", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(15L, "1", "KG");
        givenMappings(mapping(14L, "1744300", ingredient, product));
        givenManaged(171L, "Рис", UnitOfMeasure.KG, 15L, "1", "KG");
        IngredientPrice old = IngredientPrice.builder()
                .ingredient(Ingredient.builder().id(171L).build())
                .pricePerUnit(new BigDecimal("95.00")).currency("RUB")
                .effectiveFrom(LocalDate.of(2026, 9, 30)).source("ROSSTAT").build();
        when(priceRepository.findByIngredientIdAndEffectiveFrom(171L, LocalDate.of(2026, 9, 30)))
                .thenReturn(Optional.of(old));
        when(priceRepository.save(any(IngredientPrice.class))).thenAnswer(inv -> inv.getArgument(0));

        service(provider("ROSSTAT", List.of(new ExternalPriceDto("1744300",
                new BigDecimal("102.50"), "RUB", LocalDate.of(2026, 9, 30)))))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(syncLog.getUpdatedCount()).isEqualTo(1);
        assertThat(syncLog.getCreatedCount()).isZero();
        assertThat(items()).singleElement().satisfies(item ->
                assertThat(item).containsEntry("action", "UPDATED")
                        .containsEntry("oldPrice", 95.0)
                        .containsEntry("newPrice", 102.5));
        assertThat(old.getPricePerUnit()).isEqualByComparingTo("102.50");
        assertThat(old.getSource()).isEqualTo("ROSSTAT");
    }

    @Test
    @DisplayName("SYNC-11 (U11): провайдер с ProductInfoProvider → карточка освежена, updatedCount учитывает её")
    void productCardIsRefreshedForInfoProvider() {
        Ingredient ingredient = new LazyIngredient(168L, "Бананы", UnitOfMeasure.KG);
        ExternalProduct product = new LazyExternalProduct(12L, "1", "KG");
        givenMappings(mapping(11L, "1754800", ingredient, product));
        givenManaged(168L, "Бананы", UnitOfMeasure.KG, 12L, "1", "KG");
        when(priceRepository.findByIngredientIdAndEffectiveFrom(eq(168L), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class))).thenAnswer(inv -> inv.getArgument(0));
        when(cardService.refresh(eq(12L), any())).thenReturn(1);

        service(new CombinedProvider()).runPriceSync("ROSSTAT", SYNC_LOG_ID);

        verify(cardService).refresh(eq(12L), any(ExternalProductDto.class));
        assertThat(syncLog.getCreatedCount()).isEqualTo(1);
        assertThat(syncLog.getUpdatedCount()).isEqualTo(1);
        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
    }

    @Test
    @DisplayName("mappingSourceOrNull: ROSSTAT/OFF парсятся, неизвестный код → null (без 'No enum constant')")
    void mappingSourceIsParsedSafely() {
        PriceSyncService service = service(provider("ROSSTAT", List.of()));

        assertThat(service.mappingSourceOrNull("ROSSTAT")).isEqualTo(RecipeSource.ROSSTAT);
        assertThat(service.mappingSourceOrNull("OFF")).isEqualTo(RecipeSource.OFF);
        assertThat(service.mappingSourceOrNull("NO_SUCH_PROVIDER")).isNull();
    }

    @Test
    @DisplayName("loadPriceSyncTargets: null-источник → пустой список (репозиторий не дёргается)")
    void nullSourceLoadsNothing() {
        assertThat(service(provider("ROSSTAT", List.of())).loadPriceSyncTargets(null)).isEmpty();
        verify(mappingRepository, never()).findBySourceWithIngredientAndProduct(any());
    }

    @Test
    @DisplayName("last_sync_at интеграции обновляется при финализации журнала")
    void integrationLastSyncIsUpdated() {
        com.provision.entity.Integration integration = com.provision.entity.Integration.builder()
                .id(1L).provider("ROSSTAT").status("CONNECTED").build();
        when(integrationRepository.findByProvider("ROSSTAT")).thenReturn(Optional.of(integration));
        when(integrationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service(provider("ROSSTAT", List.of())).runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(integration.getLastSyncAt()).isNotNull();
        verify(integrationRepository).save(integration);
        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(syncLog.getDetails()).containsEntry("requestCount", 0);
    }

    @Test
    @DisplayName("Несколько маппингов: каждый получает свою строку items и свою запись цен")
    void severalMappingsAreSyncedInOneRun() {
        givenMappings(
                mapping(20L, "1744400", new LazyIngredient(180L, "Гречка", UnitOfMeasure.KG),
                        new LazyExternalProduct(20L, "1", "KG")),
                mapping(21L, "1744500", new LazyIngredient(181L, "Пшено", UnitOfMeasure.KG),
                        new LazyExternalProduct(21L, "800", "G")));
        givenManaged(180L, "Гречка", UnitOfMeasure.KG, 20L, "1", "KG");
        when(ingredientRepository.findById(181L)).thenReturn(Optional.of(
                Ingredient.builder().id(181L).name("Пшено").unit(UnitOfMeasure.KG).build()));
        givenManagedProduct(21L, "800", "G");
        when(priceRepository.findByIngredientIdAndEffectiveFrom(anyLong(), any(LocalDate.class)))
                .thenReturn(Optional.empty());
        when(priceRepository.save(any(IngredientPrice.class))).thenAnswer(inv -> inv.getArgument(0));

        service(provider("ROSSTAT", List.of(new ExternalPriceDto("x",
                new BigDecimal("80.00"), "RUB", LocalDate.of(2026, 9, 30)))))
                .runPriceSync("ROSSTAT", SYNC_LOG_ID);

        assertThat(syncLog.getStatus()).isEqualTo("SUCCESS");
        assertThat(syncLog.getCreatedCount()).isEqualTo(2);
        assertThat(syncLog.getDetails()).containsEntry("requestCount", 2);
        assertThat(items()).hasSize(2);
        assertThat(items().get(0)).containsEntry("productName", "Гречка").containsEntry("newPrice", 80.0);
        // 80 ₽ за 800 г → 100 ₽/KG
        assertThat(items().get(1)).containsEntry("productName", "Пшено").containsEntry("newPrice", 100.0);
    }
}
