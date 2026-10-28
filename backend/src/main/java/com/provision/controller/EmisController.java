package com.provision.controller;

import com.provision.dto.emis.EmisProductDto;
import com.provision.service.EmisCatalogService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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

    /** Поиск по названию; пустой {@code query} — первые {@code limit} позиций по алфавиту. */
    @GetMapping("/products")
    public List<EmisProductDto> searchProducts(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "20") int limit) {
        return catalogService.search(query, limit);
    }
}
