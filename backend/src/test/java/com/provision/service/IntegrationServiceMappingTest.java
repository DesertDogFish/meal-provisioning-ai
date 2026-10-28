package com.provision.service;

import com.provision.dto.integration.IngredientMappingRequest;
import com.provision.entity.ExternalProduct;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientMapping;
import com.provision.entity.RecipeSource;
import com.provision.repository.ExternalProductRepository;
import com.provision.repository.IngredientMappingRepository;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.IngredientRepository;
import com.provision.repository.IntegrationRepository;
import com.provision.repository.SyncLogRepository;
import com.provision.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Fix-14: {@link IntegrationService#createMapping} стал идемпотентным upsert'ом.
 *
 * <p>Раньше повторная привязка того же ингредиента (замена товара, повторный клик,
 * попытка перепривязать после неочевидного успеха) падала с
 * {@code IllegalStateException("Mapping already exists…")}, а пользователь не мог
 * ни увидеть, ни изменить существующую привязку. Теперь существующий маппинг
 * (ingredientId, source) переводится на новый внешний товар.</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("IntegrationService.createMapping: upsert вместо «Mapping already exists»")
class IntegrationServiceMappingTest {

    @Mock IntegrationRepository integrationRepository;
    @Mock ExternalProductRepository externalProductRepository;
    @Mock IngredientMappingRepository mappingRepository;
    @Mock IngredientPriceRepository priceRepository;
    @Mock IngredientRepository ingredientRepository;
    @Mock SyncLogRepository syncLogRepository;
    @Mock UserRepository userRepository;

    private IntegrationService service() {
        return new IntegrationService(List.of(), integrationRepository, externalProductRepository,
                mappingRepository, priceRepository, ingredientRepository, syncLogRepository, userRepository);
    }

    private static IngredientMappingRequest req(String code) {
        return new IngredientMappingRequest("ROSSTAT", code, new BigDecimal("1"), "KG");
    }

    @Test
    @DisplayName("Первая привязка: маппинга нет → создаётся и сохраняется")
    void createsWhenAbsent() {
        Ingredient ing = Ingredient.builder().id(5L).name("Апельсины").build();
        ExternalProduct ep = ExternalProduct.builder().id(1L).provider("ROSSTAT")
                .externalCode("1743453").name("Апельсины, кг").build();
        when(ingredientRepository.findById(5L)).thenReturn(Optional.of(ing));
        when(externalProductRepository.findByProviderAndExternalCode("ROSSTAT", "1743453"))
                .thenReturn(Optional.of(ep));
        when(mappingRepository.findByInternalIngredientIdAndSource(5L, RecipeSource.ROSSTAT))
                .thenReturn(Optional.empty());

        assertThatCode(() -> service().createMapping(5L, req("1743453"))).doesNotThrowAnyException();

        ArgumentCaptor<IngredientMapping> captor = ArgumentCaptor.forClass(IngredientMapping.class);
        verify(mappingRepository).save(captor.capture());
        IngredientMapping saved = captor.getValue();
        assertThat(saved.getExternalCode()).isEqualTo("1743453");
        assertThat(saved.getSource()).isEqualTo(RecipeSource.ROSSTAT);
        assertThat(saved.getInternalIngredient()).isEqualTo(ing);
        assertThat(saved.getExternalProduct()).isEqualTo(ep);
        assertThat(saved.getExternalName()).isEqualTo("Апельсины");
    }

    @Test
    @DisplayName("Повторная привязка того же ингредиента: НЕ ошибка, а замена товара (upsert)")
    void rebindsExistingInsteadOfThrowing() {
        Ingredient ing = Ingredient.builder().id(5L).name("Апельсины").build();
        ExternalProduct oldEp = ExternalProduct.builder().id(1L).provider("ROSSTAT")
                .externalCode("OLD").name("старый").build();
        ExternalProduct newEp = ExternalProduct.builder().id(2L).provider("ROSSTAT")
                .externalCode("1754800").name("Бананы, кг").build();
        IngredientMapping existing = IngredientMapping.builder()
                .id(99L).source(RecipeSource.ROSSTAT).internalIngredient(ing)
                .externalCode("OLD").externalName("Апельсины").externalProduct(oldEp).build();

        when(ingredientRepository.findById(5L)).thenReturn(Optional.of(ing));
        when(externalProductRepository.findByProviderAndExternalCode("ROSSTAT", "1754800"))
                .thenReturn(Optional.of(newEp));
        when(mappingRepository.findByInternalIngredientIdAndSource(5L, RecipeSource.ROSSTAT))
                .thenReturn(Optional.of(existing));

        // Ключевое: раньше здесь вылетало IllegalStateException("Mapping already exists…")
        assertThatCode(() -> service().createMapping(5L, req("1754800"))).doesNotThrowAnyException();

        ArgumentCaptor<IngredientMapping> captor = ArgumentCaptor.forClass(IngredientMapping.class);
        verify(mappingRepository).save(captor.capture());
        IngredientMapping saved = captor.getValue();
        // Это ТА ЖЕ запись (id=99), переведённая на новый товар — не дубль
        assertThat(saved.getId()).isEqualTo(99L);
        assertThat(saved.getExternalCode()).isEqualTo("1754800");
        assertThat(saved.getExternalProduct()).isEqualTo(newEp);
    }

    @Test
    @DisplayName("Внешний товар отсутствует → создаётся по данным запроса")
    void createsExternalProductWhenMissing() {
        Ingredient ing = Ingredient.builder().id(7L).name("Сахар").build();
        when(ingredientRepository.findById(7L)).thenReturn(Optional.of(ing));
        when(externalProductRepository.findByProviderAndExternalCode("ROSSTAT", "104"))
                .thenReturn(Optional.empty());
        when(externalProductRepository.save(any(ExternalProduct.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(mappingRepository.findByInternalIngredientIdAndSource(7L, RecipeSource.ROSSTAT))
                .thenReturn(Optional.empty());

        assertThatCode(() -> service().createMapping(7L, req("104"))).doesNotThrowAnyException();

        ArgumentCaptor<ExternalProduct> epCaptor = ArgumentCaptor.forClass(ExternalProduct.class);
        verify(externalProductRepository).save(epCaptor.capture());
        assertThat(epCaptor.getValue().getExternalCode()).isEqualTo("104");
        assertThat(epCaptor.getValue().getProvider()).isEqualTo("ROSSTAT");
        verify(mappingRepository).save(any(IngredientMapping.class));
    }

    @Test
    @DisplayName("getMappings: провайдер не источник рецептов → пустой список (без NPE)")
    void getMappingsUnknownProviderIsEmpty() {
        // parseMappingSource для неизвестного кода возвращает null → List.of()
        assertThat(service().getMappings("NO_SUCH_PROVIDER")).isEmpty();
        verify(mappingRepository, org.mockito.Mockito.never()).findBySourceWithIngredients(any());
    }

    @Test
    @DisplayName("getMappings: отдаёт привязки источника с данными ингредиента и товара")
    void getMappingsReturnsBindings() {
        Ingredient ing = Ingredient.builder().id(5L).name("Апельсины").build();
        ExternalProduct ep = ExternalProduct.builder().id(1L).provider("ROSSTAT")
                .externalCode("1743453").packAmount(new BigDecimal("1")).packUnit("KG").build();
        IngredientMapping m = IngredientMapping.builder().id(99L).source(RecipeSource.ROSSTAT)
                .internalIngredient(ing).externalCode("1743453").externalName("Апельсины")
                .externalProduct(ep).build();
        when(mappingRepository.findBySourceWithIngredients(eq(RecipeSource.ROSSTAT)))
                .thenReturn(List.of(m));

        var bindings = service().getMappings("ROSSTAT");
        assertThat(bindings).hasSize(1);
        var b = bindings.get(0);
        assertThat(b.mappingId()).isEqualTo(99L);
        assertThat(b.ingredientId()).isEqualTo(5L);
        assertThat(b.ingredientName()).isEqualTo("Апельсины");
        assertThat(b.externalCode()).isEqualTo("1743453");
        assertThat(b.packUnit()).isEqualTo("KG");
    }
}
