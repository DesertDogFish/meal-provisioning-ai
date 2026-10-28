package com.provision.integration;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Внешний товар из каталога провайдера цен.
 *
 * <p>Fix-14: добавлены {@code price} и {@code priceDate} — последняя известная
 * цена категории и её период (месяц). Для Росстата цена подтягивается из
 * кэшируемой SDMX-выгрузки прямо в поиске, чтобы админ видел реальную цифру
 * до привязки. Оба поля nullable: если выгрузка ещё не выполнена/недоступна —
 * товар возвращается без цены (поиск при этом не падает).</p>
 */
public record ExternalProductDto(
    String code,
    String name,
    String brand,
    BigDecimal packAmount,
    String packUnit,
    String imageUrl,
    BigDecimal price,
    LocalDate priceDate
) {
    /** Обратно-совместимый конструктор без цены (для провайдеров/тестов, где цена не нужна). */
    public ExternalProductDto(String code, String name, String brand,
                              BigDecimal packAmount, String packUnit, String imageUrl) {
        this(code, name, brand, packAmount, packUnit, imageUrl, null, null);
    }
}
