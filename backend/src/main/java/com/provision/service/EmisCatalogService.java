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

import java.math.BigDecimal;
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
        return search(query, limit, null);
    }

    /**
     * Поиск с контекстом продукта, к которому подбирается позиция (KB-5).
     *
     * <p>Каждая найденная позиция возвращается сразу с ценой, пересчитанной на единицу продукта
     * ({@code pricePerUnit}), и предупреждением {@code warning}, если пара сомнительна
     * (пересчёт невозможен, масштаб не сопоставим, цена уехала на порядок). Привязка при этом
     * НЕ блокируется — решение за админом (решение владельца 29.10.2026: «нужно предупреждение,
     * остальное на откуп админа»).</p>
     *
     * <p>Предупреждение выдаётся и когда цен у позиции в копии ещё нет (KB-7): признаки
     * «пересчёт невозможен» и «масштаб не сопоставим» структурные и от цены не зависят.</p>
     *
     * @param context единица/вес штуки/текущая цена продукта; null — искать без пересчёта
     */
    @Transactional(readOnly = true)
    public List<EmisProductDto> search(String query, int limit, LinkContext context) {
        int cap = limit <= 0 ? 20 : Math.min(limit, 100);
        String q = query == null ? "" : query.trim().toLowerCase();
        List<EmisProduct> found = productRepository.searchByName(q, PageRequest.of(0, cap));
        log.debug("ЕМИСС-поиск «{}»: найдено {} (лимит {}), контекст продукта: {}",
                q, found.size(), cap, context == null ? "нет" : context.ingredientUnit());
        return withLatestPrices(found, context);
    }

    /**
     * Контекст продукта, для которого ищется позиция ЕМИСС.
     *
     * @param ingredientUnit единица продукта: KG | L | PCS | PACK
     * @param pieceWeightG   вес штуки в граммах (при цене за объём трактуется как мл)
     * @param currentPrice   текущая цена продукта за ту же единицу — для проверки отклонения
     */
    public record LinkContext(String ingredientUnit, BigDecimal pieceWeightG, BigDecimal currentPrice) {

        /** Без единицы продукта пересчитать цену не на что — предупреждения не выдаём. */
        boolean usable() {
            return ingredientUnit != null && !ingredientUnit.isBlank();
        }
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
        // Контекста продукта здесь нет (выдача для списка продуктов) — pricePerUnit/warning null.
        for (EmisProductDto dto : withLatestPrices(found, null)) {
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

    /**
     * Дозагрузка свежих цен одним запросом на набор позиций и (если задан контекст продукта)
     * пересчёт цены на его единицу вместе с предупреждением о сомнительной паре.
     */
    private List<EmisProductDto> withLatestPrices(List<EmisProduct> products, LinkContext context) {
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
        boolean link = context != null && context.usable();
        return products.stream().map(p -> {
            EmisPrice price = latest.get(p.getCode());
            EmisProductDto dto = new EmisProductDto(p.getCode(), p.getName(), p.getUnitLabel(),
                    price == null ? null : price.getPrice(),
                    price == null ? null : price.effectiveFrom());
            if (!link) {
                return dto;
            }
            EmisUnit unit = new EmisUnit(p.getUnitKind(), p.getUnitAmount(), p.getUnitScale(), p.getUnitLabel());
            // FIX (найдено при написании тестов BL-23, 29.10.2026): раньше предупреждение
            // выдавалось только при наличии цены позиции, и пара «Газ сжиженный в баллонах, 50 л»
            // против баллона 220 г молчала — у 9453 в копии цен нет (KB-7). Признаки 1 и 2
            // СТРУКТУРНЫЕ (EmisUnit.convertsTo/observationSize), поэтому считаются и без цены;
            // pricePerUnit без цены, разумеется, null. Это же поведение и в mockServer.ts.
            BigDecimal priceValue = price == null ? null : price.getPrice();
            return new EmisProductDto(dto.code(), dto.name(), dto.unitLabel(), dto.latestPrice(),
                    dto.latestPriceDate(),
                    unit.rounded(unit.pricePerUnit(priceValue,
                            context.ingredientUnit(), context.pieceWeightG())),
                    unit.linkWarning(priceValue, context.ingredientUnit(),
                            context.pieceWeightG(), context.currentPrice()));
        }).toList();
    }

    private static boolean newer(EmisPrice candidate, EmisPrice current) {
        int byYear = Integer.compare(candidate.getPeriodYear(), current.getPeriodYear());
        return byYear != 0 ? byYear > 0
                : Integer.compare(candidate.getPeriodMonth(), current.getPeriodMonth()) > 0;
    }
}
