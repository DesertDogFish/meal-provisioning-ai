package com.provision.dto.trip;

import java.math.BigDecimal;

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.8, вариант A): прогресс
 * карточки похода в ОТВЕТЕ СПИСКА GET /trips — клиент больше не делает N+1
 * запросов (tripRecipes/prices/manualItems/edits на каждый поход) и не считает
 * deriveTripView по карточкам.
 *
 * Формулы — те же, что клиентский deriveTripView (ARCHITECTURE §Core
 * Calculations): факт-цены (trip_price_override), исключения (глобальные и
 * по-дневные, V23), totalCost = Σ effectiveCost НЕисключённых позиций,
 * costPerPerson = totalCost / realPeople (среднее эффективных людей по дням).
 *
 * Отметки «взято» (чеклист) живут в localStorage клиента — сервер о них не
 * знает, поэтому серверный stage ∈ {menu, shopping, checks}, а клиент
 * уточняет shopping → store по локальным отметкам (TripProgressService, п.8).
 */
public record TripProgressResponse(
    /** menu | shopping | checks (клиент уточняет shopping → store) */
    String stage,
    /** число приёмов пищи во всех днях */
    Integer meals,
    /** позиций закупки после исключений (= знаменатель этапов ②③④) */
    Integer checklistTotal,
    /** позиций с введённым чеком (факт-ценой) */
    Integer facts,
    /** сколько фактов нужно (инвариант клиента: == checklistTotal) */
    Integer factsTotal,
    /** итог закупки с фактами и исключениями (shoppingTotalFinal-семантика) */
    BigDecimal totalCost,
    /** totalCost / реальное число людей (среднее по дням с peopleOverride) */
    BigDecimal costPerPerson
) {}
