package com.provision.controller;

import com.provision.dto.emis.EmisProductDto;
import com.provision.security.JwtAuthenticationFilter;
import com.provision.service.EmisCatalogService;
import com.provision.service.EmisCatalogService.LinkContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Контракт {@code GET /api/v1/admin/emis/products} (срез веб-слоя, БД не нужна).
 *
 * <p>Что закреплено (KB-5, BL-23):</p>
 * <ul>
 *   <li>необязательные параметры контекста продукта {@code unit}/{@code pieceWeightG}/{@code price}
 *       доезжают до {@link LinkContext} ровно в том виде, в каком их отправляет
 *       {@code EmisLinkPicker} (строка → BigDecimal без потери разрядов);</li>
 *   <li>без параметров контекста сервис получает {@code LinkContext(null, null, null)} —
 *       прежний вызов пикера не ломается;</li>
 *   <li>форма ответа — {@code EmisProductDto} со всеми семью полями, включая
 *       {@code pricePerUnit} и {@code warning}; служебные {@code unitKind}/{@code unitAmount}/
 *       {@code unitScale} наружу не уходят;</li>
 *   <li>дефолт {@code limit} = 20.</li>
 * </ul>
 *
 * <p>Фильтры безопасности отключены ({@code addFilters = false}): авторизация раздела
 * проверяется интеграционными тестами, здесь важен только контракт параметров и ответа.</p>
 */
// JWT-фильтр из среза исключён: ему нужны JwtService и UserRepository (БД), а здесь
// проверяется только контракт параметров и формы ответа.
@WebMvcTest(controllers = EmisController.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                classes = JwtAuthenticationFilter.class))
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("EmisController: поиск позиций ЕМИСС с контекстом продукта")
class EmisControllerTest {

    private static final String URL = "/api/v1/admin/emis/products";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private EmisCatalogService catalogService;

    private static EmisProductDto coffee(BigDecimal perUnit, String warning) {
        return new EmisProductDto("1902", "Кофе натуральный растворимый, кг", "кг",
                new BigDecimal("4171.47"), LocalDate.of(2026, 4, 1), perUnit, warning);
    }

    @Test
    @DisplayName("unit/pieceWeightG/price → LinkContext; в ответе pricePerUnit и warning")
    void passesLinkContextToService() throws Exception {
        when(catalogService.search(any(), anyInt(), any()))
                .thenReturn(List.of(coffee(new BigDecimal("83.43"),
                        "Цена после привязки — 83,43 ₽ за шт против текущей 8,00 ₽: отличается в 10 раз.")));

        mockMvc.perform(get(URL)
                        .param("query", "кофе")
                        .param("limit", "20")
                        .param("unit", "PCS")
                        .param("pieceWeightG", "20")
                        .param("price", "8.00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value("1902"))
                .andExpect(jsonPath("$[0].name").value("Кофе натуральный растворимый, кг"))
                .andExpect(jsonPath("$[0].unitLabel").value("кг"))
                .andExpect(jsonPath("$[0].latestPrice").value(4171.47))
                .andExpect(jsonPath("$[0].latestPriceDate").value("2026-04-01"))
                .andExpect(jsonPath("$[0].pricePerUnit").value(83.43))
                .andExpect(jsonPath("$[0].warning").value(
                        "Цена после привязки — 83,43 ₽ за шт против текущей 8,00 ₽: отличается в 10 раз."));

        verify(catalogService).search("кофе", 20,
                new LinkContext("PCS", new BigDecimal("20"), new BigDecimal("8.00")));
    }

    @Test
    @DisplayName("Дробный вес штуки не теряет разряды: 12,5 г доезжает как 12.5")
    void keepsDecimalPieceWeight() throws Exception {
        when(catalogService.search(any(), anyInt(), any())).thenReturn(List.of());

        mockMvc.perform(get(URL)
                        .param("query", "крем")
                        .param("unit", "PCS")
                        .param("pieceWeightG", "12.5")
                        .param("price", "443.82"))
                .andExpect(status().isOk());

        verify(catalogService).search("крем", 20,
                new LinkContext("PCS", new BigDecimal("12.5"), new BigDecimal("443.82")));
    }

    @Test
    @DisplayName("Без параметров контекста — LinkContext(null, null, null), limit по умолчанию 20")
    void worksWithoutContext() throws Exception {
        when(catalogService.search(any(), anyInt(), any()))
                .thenReturn(List.of(coffee(null, null)));

        mockMvc.perform(get(URL).param("query", "кофе"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].pricePerUnit").doesNotExist())
                .andExpect(jsonPath("$[0].warning").doesNotExist());

        verify(catalogService).search("кофе", 20, new LinkContext(null, null, null));
    }

    @Test
    @DisplayName("Пустой запрос — список первых позиций (limit доезжает как есть)")
    void emptyQueryBrowsesCatalog() throws Exception {
        when(catalogService.search(any(), anyInt(), any())).thenReturn(List.of());

        mockMvc.perform(get(URL).param("limit", "50").param("unit", "KG"))
                .andExpect(status().isOk());

        verify(catalogService).search(null, 50, new LinkContext("KG", null, null));
    }

    @Test
    @DisplayName("Позиция без цен: latestPrice/pricePerUnit отсутствуют, warning может быть")
    void serializesPositionWithoutPrices() throws Exception {
        when(catalogService.search(any(), anyInt(), any())).thenReturn(List.of(
                new EmisProductDto("9453", "Газ сжиженный в баллонах, 50 л", "50 л",
                        null, null, null,
                        "Масштаб не сопоставим: позиция указана за «50 л», а штука продукта — 220 г.")));

        mockMvc.perform(get(URL).param("query", "газ").param("unit", "PCS").param("pieceWeightG", "220"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("9453"))
                .andExpect(jsonPath("$[0].latestPrice").doesNotExist())
                .andExpect(jsonPath("$[0].pricePerUnit").doesNotExist())
                .andExpect(jsonPath("$[0].warning").value(
                        "Масштаб не сопоставим: позиция указана за «50 л», а штука продукта — 220 г."));
    }
}
