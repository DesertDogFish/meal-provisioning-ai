package com.provision.dto.trip;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Fix-2 (U40 / PLAN R3): ручная позиция закупки. Форма — паритет с mock
 * (`mockServer.ts`, /trips/:id/manual-items) и фронтовым TripManualItem:
 * те же поля и имена, unit — строка-имя enum (KG/L/PCS/PACK).
 */
public record ManualItemResponse(
    Long id,
    Long tripId,
    /** null = позиция на весь поход */
    Long dayId,
    Long ingredientId,
    String ingredientName,
    String unit,
    BigDecimal amount,
    String note,
    LocalDateTime createdAt
) {}
