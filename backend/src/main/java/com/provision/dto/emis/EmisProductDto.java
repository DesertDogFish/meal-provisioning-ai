package com.provision.dto.emis;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Позиция локального справочника ЕМИСС для поиска при привязке продукта.
 *
 * <p>Цена и период показываются сразу: админ выбирает позицию классификатора по названию
 * И по реальной цифре (боль запусков №14–17 — «в результате поиска даже цена не высвечивается»).
 * Данные читаются из нашей БД, поэтому поиск работает и когда портал недоступен.</p>
 *
 * <p>Два последних поля заполняются только в поиске для привязки, когда запрос пришёл
 * с контекстом продукта (единица, вес штуки, текущая цена) — дефект KB-5: админ должен видеть,
 * к чему приведёт привязка, ДО сохранения. В пакетной выдаче {@code describe()} (колонка
 * «цена синхронизирована» в списке продуктов) они null.</p>
 *
 * @param code            код классификатора (хранится в {@code ingredients.emis_code})
 * @param name            название позиции вместе с единицей («Фарш мясной, кг»)
 * @param unitLabel       суффикс единицы («кг», «350 г», «шт.») — null, если не распознан
 * @param latestPrice     самая свежая цена по региону приложения — null, если данных нет
 * @param latestPriceDate первый день месяца самой свежей точки — null, если данных нет
 * @param pricePerUnit    {@code latestPrice}, пересчитанная на единицу продукта
 *                        ({@link com.provision.service.EmisUnit#pricePerUnit}) — null, если
 *                        пересчёт невозможен или контекст продукта не передан
 * @param warning         предупреждение о сомнительной паре
 *                        ({@link com.provision.service.EmisUnit#linkWarning}) — null, если пара
 *                        выглядит правдоподобно. Привязку НЕ блокирует: решение за админом.
 */
public record EmisProductDto(String code,
                             String name,
                             String unitLabel,
                             BigDecimal latestPrice,
                             LocalDate latestPriceDate,
                             BigDecimal pricePerUnit,
                             String warning) {

    /** Форма без контекста продукта — для {@code describe()} и всех прежних вызовов. */
    public EmisProductDto(String code, String name, String unitLabel,
                          BigDecimal latestPrice, LocalDate latestPriceDate) {
        this(code, name, unitLabel, latestPrice, latestPriceDate, null, null);
    }
}
