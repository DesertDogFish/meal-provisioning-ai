package com.provision.service;

import com.provision.entity.ExternalProduct;
import com.provision.integration.ExternalProductDto;
import com.provision.repository.ExternalProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Fix-16 (U11): освежение карточки внешнего продукта данными провайдера.
 *
 * <p>Раньше этот код жил в {@code IntegrationService.updateExternalProductInTx} и получал
 * на вход detached-сущность из фонового потока (без БД-сессии) — одна из причин
 * {@code LazyInitializationException} в синке цен. Теперь карточка загружается по id
 * внутри короткой транзакции, а «пустое значение из ответа не затирает данные» сохранено.</p>
 */
@DisplayName("ExternalProductCardService: освежение карточки внешнего продукта")
class ExternalProductCardServiceTest {

    @Mock private ExternalProductRepository externalProductRepository;

    private ExternalProductCardService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new ExternalProductCardService(externalProductRepository);
    }

    private ExternalProduct card() {
        return ExternalProduct.builder()
                .id(6L).provider("ROSSTAT").externalCode("1743453")
                .name("Старое название").brand("OldBrand")
                .packAmount(new BigDecimal("0.350")).packUnit("KG")
                .build();
    }

    private static ExternalProductDto info() {
        return new ExternalProductDto("1743453", "Апельсины, кг", "Росстат",
                new BigDecimal("1.000"), "KG", "https://example.org/o.jpg");
    }

    @Test
    @DisplayName("Свежие данные отличаются → поля обновлены, save вызван, результат 1")
    void updatesChangedFields() {
        ExternalProduct product = card();
        when(externalProductRepository.findById(6L)).thenReturn(Optional.of(product));
        when(externalProductRepository.save(any(ExternalProduct.class))).thenAnswer(i -> i.getArgument(0));

        int updated = service.refresh(6L, info());

        assertThat(updated).isEqualTo(1);
        ArgumentCaptor<ExternalProduct> captor = ArgumentCaptor.forClass(ExternalProduct.class);
        verify(externalProductRepository).save(captor.capture());
        assertThat(captor.getValue().getName()).isEqualTo("Апельсины, кг");
        assertThat(captor.getValue().getBrand()).isEqualTo("Росстат");
        assertThat(captor.getValue().getPackAmount()).isEqualByComparingTo("1.000");
        assertThat(captor.getValue().getPackUnit()).isEqualTo("KG");
        assertThat(captor.getValue().getImageUrl()).isEqualTo("https://example.org/o.jpg");
    }

    @Test
    @DisplayName("Идентичные данные → save не вызывается, результат 0")
    void identicalDataIsNotResaved() {
        ExternalProduct product = ExternalProduct.builder()
                .id(6L).provider("ROSSTAT").externalCode("1743453")
                .name("Апельсины, кг").brand("Росстат")
                // scale отличается (1.000 vs 1) — сравнение по compareTo, не equals
                .packAmount(new BigDecimal("1")).packUnit("KG")
                .imageUrl("https://example.org/o.jpg")
                .build();
        when(externalProductRepository.findById(6L)).thenReturn(Optional.of(product));

        assertThat(service.refresh(6L, info())).isZero();
        verify(externalProductRepository, never()).save(any());
    }

    @Test
    @DisplayName("Пустые поля ответа провайдера не затирают существующие данные")
    void blankProviderValuesDoNotEraseData() {
        ExternalProduct product = card();
        when(externalProductRepository.findById(6L)).thenReturn(Optional.of(product));
        when(externalProductRepository.save(any(ExternalProduct.class))).thenAnswer(i -> i.getArgument(0));

        int updated = service.refresh(6L, new ExternalProductDto("1743453", null, "  ",
                null, "", null));

        assertThat(updated).isZero();
        assertThat(product.getName()).isEqualTo("Старое название");
        assertThat(product.getBrand()).isEqualTo("OldBrand");
        assertThat(product.getPackAmount()).isEqualByComparingTo("0.350");
        verify(externalProductRepository, never()).save(any());
    }

    @Test
    @DisplayName("Карточка исчезла → 0 и warn, без исключения (синк цен не роняем)")
    void missingCardIsIgnored() {
        when(externalProductRepository.findById(404L)).thenReturn(Optional.empty());

        assertThat(service.refresh(404L, info())).isZero();
        verify(externalProductRepository, never()).save(any());
    }

    @Test
    @DisplayName("null-аргументы → 0 (защита от пустых входов)")
    void nullArgumentsAreSafe() {
        assertThat(service.refresh(null, info())).isZero();
        assertThat(service.refresh(6L, null)).isZero();
        verify(externalProductRepository, never()).save(any());
    }
}
