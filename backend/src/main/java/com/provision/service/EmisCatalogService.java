package com.provision.service;

import com.provision.dto.emis.EmisProductDto;
import com.provision.entity.EmisPrice;
import com.provision.entity.EmisProduct;
import com.provision.repository.EmisPriceRepository;
import com.provision.repository.EmisProductRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Чтение локальной копии ЕМИСС: поиск позиций классификатора для привязки продукта и
 * пакетная выдача «название + свежая цена» для списка продуктов.
 *
 * <p>Все данные — из нашей БД (V26/V27), поэтому привязка продукта и отображение цены не
 * зависят от доступности fedstat.ru: портал нужен только кнопке «Синхронизировать».</p>
 *
 * <p>Регион один и фиксирован конфигом: «Российская Федерация без учета новых субъектов
 * (с 01.01.2023)» = ОКАТО {@code 643004.АГ}. Именно его ряды укладываются в копию,
 * его же цены показываются в поиске.</p>
 */
@Service
@Slf4j
public class EmisCatalogService {

    private final EmisProductRepository productRepository;
    private final EmisPriceRepository priceRepository;
    private final String regionCode;

    public EmisCatalogService(EmisProductRepository productRepository,
                              EmisPriceRepository priceRepository,
                              @Value("${integration.rosstat.region-code:643004.АГ}") String regionCode) {
        this.productRepository = productRepository;
        this.priceRepository = priceRepository;
        this.regionCode = regionCode;
    }

    /** Регион локальной копии (ОКАТО). */
    public String regionCode() {
        return regionCode;
    }

    /**
     * Поиск по названию позиции классификатора (подстрока, регистр не важен).
     * Пустой запрос — первые {@code limit} позиций по алфавиту: список можно листать без ввода.
     */
    @Transactional(readOnly = true)
    public List<EmisProductDto> search(String query, int limit) {
        int cap = limit <= 0 ? 20 : Math.min(limit, 100);
        String q = query == null ? "" : query.trim().toLowerCase();
        List<EmisProduct> found = productRepository.searchByName(q, PageRequest.of(0, cap));
        log.debug("ЕМИСС-поиск «{}»: найдено {} (лимит {})", q, found.size(), cap);
        return withLatestPrices(found);
    }

    /**
     * Пакетное описание позиций по кодам — для списка продуктов (один запрос на страницу,
     * без N+1). Отсутствующие коды в карту не попадают: продукт с несуществующим кодом
     * остаётся привязанным, но показывается без названия ЕМИСС (см. ARCHITECTURE).
     */
    @Transactional(readOnly = true)
    public Map<String, EmisProductDto> describe(Collection<String> codes) {
        if (codes == null || codes.isEmpty()) {
            return Map.of();
        }
        List<EmisProduct> found = productRepository.findByCodeIn(codes);
        Map<String, EmisProductDto> byCode = new LinkedHashMap<>();
        for (EmisProductDto dto : withLatestPrices(found)) {
            byCode.put(dto.code(), dto);
        }
        return byCode;
    }

    /** Есть ли позиция с таким кодом в локальном справочнике (валидация привязки). */
    @Transactional(readOnly = true)
    public boolean exists(String emisCode) {
        return emisCode != null && !emisCode.isBlank() && productRepository.existsById(emisCode.trim());
    }

    /** Сколько всего в локальной копии — для диагностики и журнала синка. */
    @Transactional(readOnly = true)
    public long countPrices() {
        return priceRepository.countByRegionCode(regionCode);
    }

    /** Дозагрузка свежих цен одним запросом на набор позиций. */
    private List<EmisProductDto> withLatestPrices(List<EmisProduct> products) {
        if (products.isEmpty()) {
            return List.of();
        }
        List<String> codes = products.stream().map(EmisProduct::getCode).toList();
        Map<String, EmisPrice> latest = new HashMap<>();
        for (EmisPrice p : priceRepository.findByRegionCodeAndEmisCodeIn(regionCode, codes)) {
            EmisPrice prev = latest.get(p.getEmisCode());
            if (prev == null || newer(p, prev)) {
                latest.put(p.getEmisCode(), p);
            }
        }
        return products.stream().map(p -> {
            EmisPrice price = latest.get(p.getCode());
            return new EmisProductDto(p.getCode(), p.getName(), p.getUnitLabel(),
                    price == null ? null : price.getPrice(),
                    price == null ? null : price.effectiveFrom());
        }).toList();
    }

    private static boolean newer(EmisPrice candidate, EmisPrice current) {
        int byYear = Integer.compare(candidate.getPeriodYear(), current.getPeriodYear());
        return byYear != 0 ? byYear > 0
                : Integer.compare(candidate.getPeriodMonth(), current.getPeriodMonth()) > 0;
    }
}
