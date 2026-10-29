package com.provision.service;

import com.provision.dto.emis.EmisProductDto;
import com.provision.entity.EmisPrice;
import com.provision.entity.EmisProduct;
import com.provision.repository.EmisPriceRepository;
import com.provision.repository.EmisProductRepository;
import com.provision.service.EmisCatalogService.LinkContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Поиск позиций ЕМИСС с контекстом продукта (KB-5) и пакетная выдача для списка продуктов.
 *
 * <p>Репозитории — моки: проверяется логика сервиса (выбор свежей цены, пересчёт на единицу
 * продукта, предупреждение, ограничение выдачи), а не SQL. Фикстуры — реальные позиции
 * локальной копии и цены региона 643004.АГ за апрель 2026.</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("EmisCatalogService: поиск с контекстом продукта и пакетная выдача")
class EmisCatalogServiceTest {

    private static final String REGION = "643004.АГ";

    @Mock
    private EmisProductRepository productRepository;

    @Mock
    private EmisPriceRepository priceRepository;

    private EmisCatalogService service;

    @BeforeEach
    void setUp() {
        service = new EmisCatalogService(productRepository, priceRepository, REGION);
    }

    // ==================== фикстуры ====================

    /** Позиция справочника в том виде, в каком её кладёт синхронизация (unit_* разобраны). */
    private static EmisProduct product(String code, String name, String kind, String amount,
                                       String scale, String label) {
        return EmisProduct.builder()
                .code(code).name(name)
                .unitKind(kind).unitAmount(new BigDecimal(amount)).unitScale(scale).unitLabel(label)
                .loadedAt(LocalDateTime.of(2026, 10, 29, 0, 0))
                .build();
    }

    private static EmisProduct coffee() {
        return product("1902", "Кофе натуральный растворимый, кг", "MASS", "1", "KG", "кг");
    }

    private static EmisProduct gas() {
        // У этой позиции цен в копии нет (KB-7) — на ней проверяем структурное предупреждение.
        return product("9453", "Газ сжиженный в баллонах, 50 л", "VOLUME", "50", "L", "50 л");
    }

    private static EmisPrice price(String code, int year, int month, String value) {
        return EmisPrice.builder()
                .emisCode(code).regionCode(REGION)
                .periodYear(year).periodMonth(month)
                .price(new BigDecimal(value))
                .loadedAt(LocalDateTime.of(2026, 10, 29, 0, 0))
                .build();
    }

    // ==================== поиск с контекстом ====================

    @Test
    @DisplayName("С контекстом продукта: цена пересчитана на его единицу + предупреждение")
    void searchWithLinkContextRecalculatesPrice() {
        when(productRepository.searchByName(anyString(), any(Pageable.class)))
                .thenReturn(List.of(coffee()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(price("1902", 2026, 4, "4171.47")));

        List<EmisProductDto> found = service.search("кофе", 20,
                new LinkContext("PCS", new BigDecimal("20"), new BigDecimal("8.00")));

        assertThat(found).hasSize(1);
        EmisProductDto dto = found.get(0);
        assertThat(dto.code()).isEqualTo("1902");
        assertThat(dto.latestPrice()).isEqualByComparingTo("4171.47");
        assertThat(dto.latestPriceDate()).isEqualTo(LocalDate.of(2026, 4, 1));
        // 4171.47 ₽/кг → пакетик 20 г = 83.43 ₽; против текущей цены 8.00 ₽ это ×10 — звучит.
        assertThat(dto.pricePerUnit()).isEqualByComparingTo("83.43");
        assertThat(dto.warning()).contains("Цена после привязки — 83,43 ₽ за шт")
                .contains("отличается в 10 раз");
    }

    @Test
    @DisplayName("Правдоподобная пара: pricePerUnit есть, предупреждения нет")
    void searchWithPlausiblePairHasNoWarning() {
        when(productRepository.searchByName(anyString(), any(Pageable.class)))
                .thenReturn(List.of(coffee()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(price("1902", 2026, 4, "4171.47")));

        List<EmisProductDto> found = service.search("кофе", 20,
                new LinkContext("PCS", new BigDecimal("20"), new BigDecimal("17.75")));

        assertThat(found.get(0).pricePerUnit()).isEqualByComparingTo("83.43");
        assertThat(found.get(0).warning()).isNull();
    }

    @Test
    @DisplayName("Без цены у позиции: pricePerUnit null, но СТРУКТУРНОЕ предупреждение звучит")
    void warnsStructurallyEvenWithoutPrices() {
        when(productRepository.searchByName(anyString(), any(Pageable.class)))
                .thenReturn(List.of(gas(), coffee()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(price("1902", 2026, 4, "4171.47"))); // у 9453 цен нет

        List<EmisProductDto> found = service.search("газ", 20,
                new LinkContext("PCS", new BigDecimal("220"), new BigDecimal("177.53")));

        EmisProductDto gasDto = found.stream().filter(d -> d.code().equals("9453")).findFirst().orElseThrow();
        assertThat(gasDto.latestPrice()).isNull();
        assertThat(gasDto.pricePerUnit()).isNull();
        assertThat(gasDto.warning()).contains("Масштаб не сопоставим")
                .contains("50 л").contains("220 г").contains("227 раз");
    }

    @Test
    @DisplayName("Без контекста (null): pricePerUnit и warning не заполняются")
    void searchWithoutContextHasNoLinkFields() {
        when(productRepository.searchByName(anyString(), any(Pageable.class)))
                .thenReturn(List.of(coffee()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(price("1902", 2026, 4, "4171.47")));

        List<EmisProductDto> found = service.search("кофе", 20, null);

        assertThat(found.get(0).latestPrice()).isEqualByComparingTo("4171.47");
        assertThat(found.get(0).pricePerUnit()).isNull();
        assertThat(found.get(0).warning()).isNull();
    }

    @Test
    @DisplayName("Контекст без единицы продукта игнорируется: пересчитывать не на что")
    void contextWithoutUnitIsIgnored() {
        when(productRepository.searchByName(anyString(), any(Pageable.class)))
                .thenReturn(List.of(coffee()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(price("1902", 2026, 4, "4171.47")));

        List<EmisProductDto> blank = service.search("кофе", 20, new LinkContext("  ", null, null));
        List<EmisProductDto> nullUnit = service.search("кофе", 20, new LinkContext(null, null, null));

        assertThat(blank.get(0).pricePerUnit()).isNull();
        assertThat(blank.get(0).warning()).isNull();
        assertThat(nullUnit.get(0).warning()).isNull();
    }

    @Test
    @DisplayName("Двухаргументный search — тот же поиск без контекста (обратная совместимость)")
    void twoArgSearchKeepsOldBehaviour() {
        when(productRepository.searchByName(anyString(), any(Pageable.class)))
                .thenReturn(List.of(coffee()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(price("1902", 2026, 4, "4171.47")));

        List<EmisProductDto> found = service.search("кофе", 20);

        assertThat(found.get(0).pricePerUnit()).isNull();
        assertThat(found.get(0).warning()).isNull();
    }

    // ==================== выбор свежей цены и выдача ====================

    @Test
    @DisplayName("Свежая цена — максимум по (год, месяц), а не последняя в выдаче БД")
    void picksLatestPriceByYearThenMonth() {
        when(productRepository.searchByName(anyString(), any(Pageable.class)))
                .thenReturn(List.of(coffee()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(
                        price("1902", 2026, 4, "4171.47"),
                        price("1902", 2025, 12, "3980.00"),
                        price("1902", 2026, 3, "4100.00")));

        EmisProductDto dto = service.search("кофе", 20, null).get(0);

        assertThat(dto.latestPrice()).isEqualByComparingTo("4171.47");
        assertThat(dto.latestPriceDate()).isEqualTo(LocalDate.of(2026, 4, 1));
    }

    @Test
    @DisplayName("Пустая выдача не идёт в репозиторий цен")
    void emptyResultSkipsPriceQuery() {
        when(productRepository.searchByName(anyString(), any(Pageable.class))).thenReturn(List.of());

        assertThat(service.search("нет-такого", 20, new LinkContext("KG", null, null))).isEmpty();
        verify(priceRepository, never()).findByRegionCodeAndEmisCodeIn(anyString(), anyCollection());
    }

    @Test
    @DisplayName("Лимит выдачи: 0/отрицательный → 20, больше 100 → 100")
    void capsLimit() {
        when(productRepository.searchByName(anyString(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        service.search("", 0, null);
        service.search("", -5, null);
        service.search("", 500, null);
        service.search("", 7, null);

        verify(productRepository, org.mockito.Mockito.times(4))
                .searchByName(anyString(), pageable.capture());
        assertThat(pageable.getAllValues()).extracting(Pageable::getPageSize)
                .containsExactly(20, 20, 100, 7);
    }

    @Test
    @DisplayName("describe(): пакетная выдача для списка продуктов — без полей привязки")
    void describeNeverFillsLinkFields() {
        when(productRepository.findByCodeIn(anyCollection())).thenReturn(List.of(coffee(), gas()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(price("1902", 2026, 4, "4171.47")));

        Map<String, EmisProductDto> byCode = service.describe(List.of("1902", "9453", "нету"));

        assertThat(byCode).containsOnlyKeys("1902", "9453"); // отсутствующий код не попадает
        assertThat(byCode.get("1902").latestPrice()).isEqualByComparingTo("4171.47");
        assertThat(byCode.get("1902").pricePerUnit()).isNull();
        assertThat(byCode.get("1902").warning()).isNull();
        assertThat(byCode.get("9453").latestPrice()).isNull();
    }

    @Test
    @DisplayName("describe() с пустым набором кодов — пустая карта без запросов")
    void describeWithoutCodesIsNoop() {
        assertThat(service.describe(List.of())).isEmpty();
        assertThat(service.describe(null)).isEmpty();
        verify(productRepository, never()).findByCodeIn(anyCollection());
    }

    @Test
    @DisplayName("exists(): пустой и null-код — false без обращения к БД")
    void existsGuardsBlankCode() {
        assertThat(service.exists(null)).isFalse();
        assertThat(service.exists("  ")).isFalse();
        verify(productRepository, never()).existsById(anyString());

        when(productRepository.existsById("1902")).thenReturn(true);
        assertThat(service.exists(" 1902 ")).isTrue(); // код тримится
    }

    @Test
    @DisplayName("regionCode() отдаёт регион локальной копии из конфига")
    void exposesRegionCode() {
        assertThat(service.regionCode()).isEqualTo(REGION);
    }

    @Test
    @DisplayName("countPrices() считает точки своего региона")
    void countsPricesOfRegion() {
        when(priceRepository.countByRegionCode(REGION)).thenReturn(1234L);

        assertThat(service.countPrices()).isEqualTo(1234L);
    }

    @Test
    @DisplayName("Поиск приводит запрос к нижнему регистру и обрезает пробелы")
    void normalizesQuery() {
        when(productRepository.searchByName(anyString(), any(Pageable.class))).thenReturn(List.of());

        service.search("  КоФе  ", 20, null);

        verify(productRepository).searchByName(eq("кофе"), any(Pageable.class));
    }

    @Test
    @DisplayName("Форма DTO — ровно контракт EmisProductDto (7 полей, служебное unit_* наружу не уходит)")
    void dtoShapeMatchesContract() {
        when(productRepository.searchByName(anyString(), any(Pageable.class)))
                .thenReturn(List.of(coffee()));
        when(priceRepository.findByRegionCodeAndEmisCodeIn(eq(REGION), anyCollection()))
                .thenReturn(List.of(price("1902", 2026, 4, "4171.47")));

        EmisProductDto dto = service.search("кофе", 20, new LinkContext("KG", null, null)).get(0);

        assertThat(dto.code()).isEqualTo("1902");
        assertThat(dto.name()).isEqualTo("Кофе натуральный растворимый, кг");
        assertThat(dto.unitLabel()).isEqualTo("кг");
        assertThat(dto.latestPrice()).isEqualByComparingTo("4171.47");
        assertThat(dto.latestPriceDate()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(dto.pricePerUnit()).isEqualByComparingTo("4171.47");
        assertThat(dto.warning()).isNull();
    }
}
