package com.provision.controller;

import com.provision.dto.emis.EmisProductDto;
import com.provision.service.EmisCatalogService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

/**
 * Локальный справочник ЕМИСС: поиск позиций классификатора для привязки продукта
 * (раздел «Продукты» → «Редактировать» → «Источник цены»).
 *
 * <p>Данные читаются из нашей БД ({@code emis_products}/{@code emis_prices}), а не с портала:
 * привязка не должна зависеть от доступности fedstat.ru и от анти-бота.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/emis")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class EmisController {

    private final EmisCatalogService catalogService;

    /**
     * Поиск по названию; пустой {@code query} — первые {@code limit} позиций по алфавиту.
     *
     * <p>Необязательные {@code unit}/{@code pieceWeightG}/{@code price} — контекст продукта,
     * к которому подбирается позиция (дефект KB-5). С ним каждый результат приходит сразу
     * с ценой, пересчитанной на единицу продукта, и предупреждением о сомнительной паре;
     * привязку это НЕ блокирует — решение за админом.</p>
     */
    @GetMapping("/products")
    public List<EmisProductDto> searchProducts(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String unit,
            @RequestParam(required = false) BigDecimal pieceWeightG,
            @RequestParam(required = false) BigDecimal price) {
        return catalogService.search(query, limit,
                new EmisCatalogService.LinkContext(unit, pieceWeightG, price));
    }
}
