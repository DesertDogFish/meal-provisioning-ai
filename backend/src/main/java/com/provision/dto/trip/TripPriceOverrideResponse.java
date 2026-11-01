package com.provision.dto.trip;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Факт-цена похода (УРОВЕНЬ `trip_price_overrides`).
 *
 * <p>BL-10 (01.11.2026): добавлена {@code unit} — {@code actualPrice} это цена
 * за ОДНУ учётную единицу продукта (₽/кг, ₽/шт), и без единицы клиент не может
 * отформатировать её как «350,00 ₽/кг»: «350» одинаково читается и как сумма,
 * и как цена за килограмм. {@code unit} — имя {@link com.provision.entity.UnitOfMeasure}
 * (KG/L/PCS/PACK), {@code null} у удалённого/незагруженного продукта;
 * {@code currency} по-прежнему ISO-код валюты (RUB).
 */
public record TripPriceOverrideResponse(
    Long id,
    Long ingredientId,
    String ingredientName,
    String unit,
    BigDecimal actualPrice,
    String currency,
    String comment,
    String updatedByEmail,
    LocalDateTime updatedAt
) {}
