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
 * @param code            код классификатора (хранится в {@code ingredients.emis_code})
 * @param name            название позиции вместе с единицей («Фарш мясной, кг»)
 * @param unitLabel       суффикс единицы («кг», «350 г», «шт.») — null, если не распознан
 * @param latestPrice     самая свежая цена по региону приложения — null, если данных нет
 * @param latestPriceDate первый день месяца самой свежей точки — null, если данных нет
 */
public record EmisProductDto(String code,
                             String name,
                             String unitLabel,
                             BigDecimal latestPrice,
                             LocalDate latestPriceDate) {
}
