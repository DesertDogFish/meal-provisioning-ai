package com.provision.integration;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Слепок одной выгрузки ЕМИСС (SDMX): справочник товаров и ряды цен по региону.
 *
 * <p>Портал для нас — только транспорт: слезок разбирается из ответа
 * {@code downloadData.do?format=sdmx} и целиком укладывается в локальную копию
 * ({@code emis_products} / {@code emis_prices}). Дальше приложение работает со своей БД:
 * поиск для привязки продукта и цены берутся локально, повторных обращений к порталу нет.</p>
 *
 * <p>{@code CodeLists} в SDMX-ответе всегда полные (885 товаров, 450 ОКАТО) независимо от
 * выбранных фильтров, поэтому один узкий запрос обновляет весь справочник.</p>
 *
 * @param fetchedAt  момент разбора ответа (диагностика/журнал)
 * @param regionCode код ОКАТО, по которому отфильтрованы ряды (например {@code 643004.АГ});
 *                   {@code null}, если в ответе нет измерения территорий
 * @param catalog    код классификатора → название позиции («105» → «Фарш мясной, кг»)
 * @param prices     код классификатора → точки цен, отсортированные по дате
 */
public record EmisSnapshot(Instant fetchedAt,
                           String regionCode,
                           LinkedHashMap<String, String> catalog,
                           Map<String, List<PricePoint>> prices) {

    /** Одна точка ряда: дата = первый день месяца наблюдения, цена в рублях за единицу позиции. */
    public record PricePoint(LocalDate date, BigDecimal price) {}
}
