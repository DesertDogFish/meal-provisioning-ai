/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * роуты /trips (CRUD, дни, приёмы пищи, покупки, сводка).
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import type { Trip } from '../types';
import { nextSubstitutionSeq, nextRemovedSeq, nextManualSeq, products, recipes, trips, priceOverrides, shoppingExcluded, substitutions, removedItems, manualItems, allTripEdits, applyTripEditsToRows, loadClientStage, users, UNIT_LABELS, r3, r2, editRecipeKey, editIngredientKey } from './mockState';
import { tripPricesFor, ingredientEditsFor, tripsWithProgress, denormalizeOverrideKey } from './mockTripProgress'; // cleanup-п.8
import type { MockSubstitution, MockManualItem } from './mockState';

export function handleTripsImpl(srv: any, method: string, path: string, body?: any): any {
  const parts = path.split('/').filter(Boolean);

  // V20: цены похода — по trip-scoped копиям продуктов; если снепшотов нет
  // (legacy/сид-походы) — фолбэк на глобальный срез, как TripPriceController
  if (method === 'GET' && parts.length === 3 && parts[2] === 'prices') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    }
    // cleanup-п.8/п.9: логика среза цен — общий хелпер (mockTripProgress.tripPricesFor)
    return tripPricesFor(tripId);
  }

  // CONTRACT-P1 (E2E): POST/DELETE /trips/:id/days/:dayId/meals — раньше роута не
  // было, TripDetailPage ловил 405 и добавленный приём пищи не появлялся в списке.
  if (parts.length === 5 && parts[2] === 'days' && parts[4] === 'meals') {
    const tripId = parts[1];
    const dayId = parts[3];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    const day = (trip.days || []).find(d => d.id === dayId);
    if (!day) {
      throw { status: 404, message: 'Not found', detail: `Trip day ${dayId} not found` };
    }
    if (!day.meals) day.meals = [];

    if (method === 'POST') {
      if (!body?.recipeId) {
        throw { status: 400, message: 'Bad request', detail: 'recipeId is required' };
      }
      // V20: приём пищи ссылается на trip-scoped копию блюда, а не на справочник
      const globalRecipe: any = recipes.find(r => r.id === body.recipeId && !(r as any).tripId);
      const snap = globalRecipe ? srv.snapRecipeForTrip(tripId, globalRecipe) : recipes.find(r => r.id === body.recipeId);
      if (!snap) {
        throw { status: 404, message: 'Not found', detail: `Recipe ${body.recipeId} not found` } as any;
      }
      const meal = {
        id: `m-${Date.now()}`,
        tripDayId: dayId,
        mealType: body.mealType ?? 'LUNCH',
        recipeId: snap.id,
        peopleOverride: body.peopleOverride,
        sortOrder: body.sortOrder ?? day.meals.length + 1,
      };
      day.meals.push(meal);
      return meal; // mock трактует отсутствие status как успешный ответ (200)
    }
    if (method === 'GET') {
      return day.meals;
    }
  }

  // PATCH /trips/:id/meals/:mealId — правка per-meal атрибутов (peopleOverride и т.п.);
  // composition пересчитывается при следующем GET (рецептурные строки масштабируются,
  // EXTRA-абсолюты фиксированы на приём — §3).
  if (parts.length === 4 && parts[2] === 'meals' && method === 'PATCH') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    let meal: any = null;
    for (const d of trip.days || []) {
      const m = (d.meals || []).find((x: any) => String(x.id) === String(parts[3]));
      if (m) meal = m;
    }
    if (!meal) throw { status: 404, message: 'Not found', detail: `Meal ${parts[3]} not found in trip` } as any;
    if (body?.peopleOverride != null) meal.peopleOverride = Number(body.peopleOverride);
    if (body?.mealType != null) meal.mealType = body.mealType;
    return meal;
  }

  // ===== FORM-meal-composition-spec §4.2/§4.4: состав приёма (Модалка B) =====
  // GET/PUT /trips/:id/meals/:mealId/composition — mock-паритет с реальным бэкендом:
  // сервер считает ВСЁ масштабирование (§3: SCALE → people → EXCLUDE → EXTRA → SUBST).
  if (parts.length === 5 && parts[2] === 'meals' && parts[4] === 'composition') {
    return srv.handleMealComposition(method, parts[1], parts[3], body) as any;
  }

  // FORM-meal-composition-spec §2.2: после batch PUT UI делает refetch summary (T6-пайплайн).
  // Mock-паритет: агрегируем composition-ответы всех приёмов похода в kcal/weight/cost.
  if (parts.length === 2 && parts[1] === 'summary' && method === 'GET') {
    const tripId = parts[0];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    let kcal = 0, weightGrams = 0, plannedCost = 0, mealCount = 0;
    for (const d of trip.days || []) {
      for (const m of d.meals || []) {
        try {
          const rec: any = recipes.find(r => r.id === m.recipeId);
          if (!rec) continue;
          const comp = srv.buildCompositionResponse(trip, d, m, rec);
          kcal += comp.totals.kcal;
          weightGrams += comp.totals.weightGrams;
          plannedCost += comp.totals.plannedCost;
          mealCount++;
        } catch { /* приём без блюда — пропускаем */ }
      }
    }
    return {
      tripId,
      mealCount,
      kcalTotal: r2(kcal),
      weightGrams: r3(weightGrams),
      plannedCost: r2(plannedCost),
    };
  }

  // DELETE /trips/:id/days/:dayId/meals/:mealId
  if (parts.length === 6 && parts[2] === 'days' && parts[4] === 'meals' && method === 'DELETE') {
    const trip = trips.find(t => t.id === parts[1]);
    const day = trip?.days?.find(d => d.id === parts[3]);
    if (!trip || !day) {
      throw { status: 404, message: 'Not found', detail: `Trip day ${parts[3]} not found` };
    }
    const idx = (day.meals || []).findIndex(m => m.id === parts[5]);
    if (idx === -1) {
      throw { status: 404, message: 'Not found', detail: `Meal ${parts[5]} not found` };
    }
    day.meals!.splice(idx, 1);
    return null;
  }
  
  // GET /trips — cleanup-п.8 (вариант A): список СРАЗУ с прогрессом карточек
  // (паритет backend TripService.getUserTrips → TripProgressService)
  if (parts.length === 1 && method === 'GET') {
    return tripsWithProgress();
  }
  
  // PUT /trips/:id — U36 (список 26.10): полноценное редактирование похода.
  // Имя/заметки/люди — всегда; смена дат — с перегенерацией дней (план по дням
  // стирается, состав-правки похода снимаются). Backend-задача: снять запрет
  // «Cannot change trip dates» в TripService.updateTrip и повторить эту семантику.
  if (parts.length === 2 && method === 'PUT') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    }
    const datesChanged =
      (body?.startDate != null && body.startDate !== trip.startDate) ||
      (body?.endDate != null && body.endDate !== trip.endDate);
    if (body?.name != null) trip.name = String(body.name);
    if (body?.notes !== undefined) trip.notes = body.notes == null ? undefined : String(body.notes);
    if (body?.defaultPeople != null) trip.defaultPeople = Number(body.defaultPeople) || trip.defaultPeople;
    if (datesChanged) {
      trip.startDate = String(body.startDate ?? trip.startDate);
      trip.endDate = String(body.endDate ?? trip.endDate);
      // Fix-2 (п.1): стираются данные ТОЛЬКО дней, ушедших из диапазона.
      // Пересекающиеся дни сохраняются вместе с приёмами; новые даты добавляются.
      const oldDays: any[] = (trip as any).days || [];
      const removedDayIds = new Set(
        oldDays
          .filter(d => d.dayDate < trip.startDate || d.dayDate > trip.endDate)
          .map(d => d.id)
      );
      const kept = oldDays.filter(d => !removedDayIds.has(d.id));
      const keptDates = new Set(kept.map(d => d.dayDate));
      const start = new Date(`${trip.startDate}T00:00:00`);
      const end = new Date(`${trip.endDate}T00:00:00`);
      // seq — за максимальным числовым суффиксом существующих id (несколько PUT
      // подряд не должны давать коллизии 'd-<trip>-N')
      let seq = kept.reduce((mx: number, d: any) => {
        const m = String(d.id).match(/-(\d+)$/);
        return m ? Math.max(mx, Number(m[1]) + 1) : mx;
      }, oldDays.length);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (!keptDates.has(iso)) {
          kept.push({ id: `d-${trip.id}-${seq++}`, tripId: trip.id, dayDate: iso, meals: [] });
        }
      }
      kept.sort((a, b) => a.dayDate.localeCompare(b.dayDate));
      (trip as any).days = kept;
      // ручные позиции удалённых дней — стираются; походные (dayId=null) — живут
      if (removedDayIds.size > 0 && manualItems[trip.id]) {
        manualItems[trip.id] = manualItems[trip.id].filter(
          mi => mi.dayId == null || !removedDayIds.has(mi.dayId)
        );
      }
      // правки состава привязаны к РЕЦЕПТАМ похода (не к дням) — остаются,
      // пока жив хотя бы один приём; «воскрешения» удалённых дней больше нет.
    }
    return trip;
  }

  // U40 (список 26.10) / PLAN R3: ручные позиции закупки (продукты к дню/походу).
  // GET/POST /trips/:id/manual-items
  if (parts.length === 3 && parts[2] === 'manual-items' && (method === 'GET' || method === 'POST')) {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    }
    const list = manualItems[tripId] || (manualItems[tripId] = []);
    if (method === 'GET') return list;
    const ingredientId = body?.ingredientId == null ? null : String(body.ingredientId);
    const amount = Number(body?.amount);
    const product = ingredientId ? products.find(p => p.id === ingredientId) : null;
    if (!product) {
      throw { status: 404, message: 'Not found', detail: `Ingredient ${ingredientId} not found` } as any;
    }
    if (!(amount > 0)) {
      throw { status: 400, message: 'Bad request', detail: 'amount must be > 0' } as any;
    }
    const dayId = body?.dayId == null || body.dayId === '' ? null : String(body.dayId);
    if (dayId != null && !(trip.days || []).some((d: any) => d.id === dayId)) {
      throw { status: 404, message: 'Not found', detail: `Trip day ${dayId} not found` } as any;
    }
    // AGENTS §9 / Fix-2: ссылка «поход → продукт» указывает на trip-scoped копию,
    // если она есть (иначе id ручной позиции и id строки закупки не сольются в одну).
    const snap = products.find(
      (x: any) => (x as any).tripId === tripId && String((x as any).snapshotOf ?? '') === String(product.id)
    );
    const created: MockManualItem = {
      id: `mi-${nextManualSeq()}`,
      tripId,
      dayId,
      ingredientId: snap ? snap.id : product.id,
      ingredientName: product.name,
      unit: product.unit,
      amount,
      note: body?.note ? String(body.note) : undefined,
      createdAt: new Date().toISOString(),
    };
    list.push(created);
    return created;
  }

  // DELETE /trips/:id/manual-items/:itemId
  if (parts.length === 4 && parts[2] === 'manual-items' && method === 'DELETE') {
    const tripId = parts[1];
    const list = manualItems[tripId] || [];
    const idx = list.findIndex(x => x.id === parts[3]);
    if (idx === -1) {
      throw { status: 404, message: 'Not found', detail: `Manual item ${parts[3]} not found` } as any;
    }
    list.splice(idx, 1);
    return null;
  }

  // GET /trips/:id
  if (parts.length === 2 && method === 'GET') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    return trip;
  }
  
  // V20: trip-scoped копии блюд похода (паритет с GET /api/v1/trips/{id}/recipes)
  if (parts.length === 3 && parts[2] === 'recipes' && method === 'GET') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    }
    return recipes
      .filter(r => (r as any).tripId === tripId)
      .map(r => srv.recipeToResponse(r));
  }

  // GET /trips/:id/summary/shopping
  if (parts.length === 4 && parts[2] === 'summary' && parts[3] === 'shopping' && method === 'GET') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }

    // CONTRACT-P1 (PLAN.md Backlog п.1): поля контракта backend ShoppingItemResponse
    // (unitLabel, planned/actual пары, packsToBuy/buyAmount/leftoverAmount/substitutedFrom).
    // Формула агрегации сохранена байт-в-байт как в прежней mock-реализации —
    // контрактные тесты FIX-1/FIX-2 (src/test/contract.test.ts) зафиксированы на ней
    // (замер: 9 passed до и после рефакторинга). Реальная day×recipe агрегация
    // сознательно НЕ подключается здесь: она меняет зафиксированные контрактные
    // числа и относится к бэкенд-фазе (P1 п.3 «Интеграционные бэкенд-тесты»).
    // CONTRACT-P1: id-ключи соответствуют фикстурам contract.test.ts (FIX-1/FIX-2):
    // '1'≡ing1 Гречка, '2'≡ing6 Тушёнка, '3'≡ing12 Соль, '4'≡ing3 Хлопья, '5'≡ing4 Вода.
    // Реальный ingredientId хранится в catalogId — по нему подтягиваются pack/substitution.
    type MockShoppingRow = {
      ingredientId: string;
      catalogId: string;
      ingredientName: string;
      unit: string;
      totalAmount: number;
      plannedUnitPrice: number | null;
      actualUnitPrice: number | null;
      plannedCost: number | null;
      actualCost: number | null;
      overridden: boolean;
      hasPlannedPrice: boolean;
    };

    // CONTRACT-P1/FIX-2: явная карта «строка сводки → ключ оверрайда».
    // Ключ хранилища оверрайдов нормализуется ('ing1'→'1'), поэтому строки
    // берут override именно по своему ingredientId — иначе каталожный id
    // (ing6 для Тушёнки) ломал связку с фикстурами contract.test.ts.
    const ov = (rowIngredientId: string) => priceOverrides[tripId]?.[rowIngredientId];
    const baseRows: MockShoppingRow[] = [
      {
        ingredientId: '1',
        catalogId: 'ing1',
        ingredientName: 'Гречка',
        unit: 'KG',
        totalAmount: 1.8,
        plannedUnitPrice: 200,
        actualUnitPrice: ov('1')?.actualPrice || 200,
        plannedCost: 360,
        actualCost: (ov('1')?.actualPrice || 200) * 1.8,
        overridden: !!ov('1'),
        hasPlannedPrice: true
      },
      {
        ingredientId: '2',
        catalogId: 'ing6',
        ingredientName: 'Тушёнка говяжья',
        unit: 'PCS',
        totalAmount: 9,
        plannedUnitPrice: 210,
        actualUnitPrice: ov('2')?.actualPrice || 210,
        plannedCost: 1890,
        actualCost: (ov('2')?.actualPrice || 210) * 9,
        overridden: !!ov('2'),
        hasPlannedPrice: true
      },
      {
        ingredientId: '3',
        catalogId: 'ing12',
        ingredientName: 'Соль',
        unit: 'KG',
        totalAmount: 0.045,
        plannedUnitPrice: null,
        actualUnitPrice: ov('3')?.actualPrice || null,
        plannedCost: null,
        actualCost: ov('3')?.actualPrice ? ov('3')!.actualPrice * 0.045 : null,
        overridden: !!ov('3'),
        hasPlannedPrice: false
      },
      {
        ingredientId: '4',
        catalogId: 'ing3',
        ingredientName: 'Овсяные хлопья',
        unit: 'KG',
        totalAmount: 0.32,
        plannedUnitPrice: 150,
        actualUnitPrice: ov('4')?.actualPrice || 150,
        plannedCost: 48,
        actualCost: (ov('4')?.actualPrice || 150) * 0.32,
        overridden: !!ov('4'),
        hasPlannedPrice: true
      },
      {
        ingredientId: '5',
        catalogId: 'ing4',
        ingredientName: 'Вода',
        unit: 'L',
        totalAmount: 1.0,
        plannedUnitPrice: 45,
        actualUnitPrice: ov('5')?.actualPrice || 45,
        plannedCost: 45,
        actualCost: (ov('5')?.actualPrice || 45) * 1.0,
        overridden: !!ov('5'),
        hasPlannedPrice: true
      }
    ];

    // Фаза 13 (п.1): пер-походные правки состава применяются ДО финализации строк:
    // from→to × ratio, ручные добавления, мягкие удаления (to=null).
    const scalePerServing = (aps: number) => aps * (trip.defaultPeople || 1) * Math.max(1, trip.days?.length || 1);
    const editedRows = applyTripEditsToRows(tripId, baseRows, scalePerServing);

    // Фаза 13 (п.6): soft-disable позиций закупки (из стейджа или PUT /shopping-exclusions)
    const excludedSet = new Set<string>([
      ...(shoppingExcluded[tripId] || []),
      ...Object.keys(loadClientStage('trip-shopping-excluded', tripId)),
    ]);
    const inScope = editedRows.filter(r => !excludedSet.has(String(r.catalogId ?? r.ingredientId)) && !excludedSet.has(String(r.ingredientId)));

    // CONTRACT-P1: расширенные поля — берутся из реального справочника продуктов
    // (unitLabel/packSize/roundToPacks), substitutedFrom — из замещений похода
    // (пер-походные TripIngredientSubstitution + legacy-флаги рецептов).
    const substitutedIds = new Set<string>();
    for (const r of recipes) {
      for (const ri of r.ingredients) {
        if ((ri as any).substitutedFrom) substitutedIds.add(ri.ingredientId);
      }
    }
    for (const s of substitutions[tripId] || []) {
      if (s.toIngredientId != null) substitutedIds.add(String(s.toIngredientId));
    }

    const items = inScope.map(row => {
      const product = products.find(p => p.id === row.catalogId);
      const packSize = product?.packSize ?? null;
      const roundToPacks = !!product?.roundToPacks && !!packSize;
      const packsToBuy = roundToPacks ? Math.ceil(row.totalAmount / (packSize as number)) : null;
      const buyAmount = roundToPacks ? (packsToBuy as number) * (packSize as number) : row.totalAmount;
      const leftoverAmount = roundToPacks ? buyAmount - row.totalAmount : 0;

      return {
        ...row,
        ingredientId: row.catalogId ?? row.ingredientId, // CONTRACT-P1: реальный id из каталога (обратная совместимость чисел — в catalogId)
        unitLabel: product ? UNIT_LABELS[product.unit] || product.unit : UNIT_LABELS[row.unit] || row.unit,
        packSize,
        roundToPacks,
        packsToBuy,
        buyAmount,
        leftoverAmount,
        substitutedFrom: (() => {
          const cid = String(row.catalogId ?? row.ingredientId);
          if (!substitutedIds.has(cid)) return null;
          const src = (substitutions[tripId] || []).find(s => String(s.toIngredientId) === cid && s.fromIngredientId != null);
          return src ? String(src.fromIngredientId) : cid;
        })(),
      };
    });

    // Фаза 14: итоги — целые рубли; позиции и цены за единицу остаются точными.
    // Дельта считается от ТОЧНЫХ сумм (округление только для отображения итогов),
    // иначе округление вносило бы артефакт ~±0.02 п.п. в процент.
    const totalPlannedCostExact = items.reduce((sum, i) => sum + (i.plannedCost || 0), 0);
    const totalActualCostExact = items.reduce((sum, i) => sum + (i.actualCost || 0), 0);
    const totalPlannedCost = Math.round(totalPlannedCostExact);
    const totalActualCost = Math.round(totalActualCostExact);
    const deltaPercent = totalPlannedCostExact > 0 ? ((totalActualCostExact - totalPlannedCostExact) / totalPlannedCostExact) * 100 : null;

    return {
      items,
      totalPlannedCost,
      totalActualCost,
      deltaPercent,
      overriddenCount: items.filter(i => i.overridden).length,
      hasMissingPrices: items.some(i => !i.hasPlannedPrice),
      missingIngredients: items.filter(i => !i.hasPlannedPrice).map(i => i.ingredientName),
      // Фаза 13 (п.6): позиции, снятые soft-disable (UI показывает их серыми)
      excludedIngredientIds: [...excludedSet],
    };
  }

  // ===== Фаза 13 (п.1): пер-походные замещения состава (TripIngredientSubstitution) =====
  // GET /trips/:id/ingredient-edits — паритет с backend TripIngredientEditResponse:
  // ПОЛНЫЙ список правок состава (замены + добавления + удаления) с именами и
  // количествами. Фронт (getTripEdits) читает именно его — в real-режиме
  // GET /substitutions отдаёт только «чистые» замены без количеств.
  if (parts.length === 3 && parts[2] === 'ingredient-edits' && method === 'GET') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    }
    // cleanup-п.8/п.9: обогащение правок — общий хелпер (mockTripProgress.ingredientEditsFor)
    return ingredientEditsFor(tripId);
  }

  // GET /trips/:id/substitutions
  if (parts.length === 3 && parts[2] === 'substitutions' && method === 'GET') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    // U30 (список 26.10): обогащение имён/единиц — паритет с backend
    // SubstitutionResponse (recipeName/fromIngredientName/toIngredientName),
    // плюс mock-поля absoluteAmount/mealId/scale для overlay меню и EXTRA-количеств.
    const nameOf = (id: string | null): { name: string | null; unit: string | null } => {
      if (id == null) return { name: null, unit: null };
      const p = products.find(x => x.id === String(id))
        ?? products.find(x => x.id === editIngredientKey(id));
      return { name: p?.name ?? null, unit: p?.unit ?? null };
    };
    const enrich = (s: MockSubstitution) => {
      const from = nameOf(s.fromIngredientId);
      const to = nameOf(s.toIngredientId);
      const rec = recipes.find(r => editRecipeKey(r.id) === editRecipeKey(s.recipeId));
      return {
        ...s,
        recipeName: rec?.name ?? null,
        fromIngredientName: from.name,
        toIngredientName: to.name,
        fromUnit: from.unit,
        toUnit: to.unit,
      };
    };
    return [
      ...(substitutions[tripId] || []).map(enrich),
      ...(removedItems[tripId] || []).map(enrich),
    ];
  }

  // POST /trips/:id/substitutions — создать замену/добавление/мягкое удаление позиции
  if (parts.length === 3 && parts[2] === 'substitutions' && method === 'POST') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    const recipeId = String(body?.recipeId ?? '');
    if (!recipes.find(r => r.id === recipeId)) {
      throw { status: 404, message: 'Not found', detail: `Recipe ${recipeId} not found` };
    }
    const fromId = body?.fromIngredientId == null ? null : String(body.fromIngredientId);
    const toId = body?.toIngredientId == null ? null : String(body.toIngredientId);
    if (fromId == null && toId == null) {
      throw { status: 400, message: 'Bad request', detail: 'fromIngredientId or toIngredientId required' };
    }
    if (fromId != null && toId != null && fromId === toId) {
      throw { status: 400, message: 'Bad request', detail: 'From and to ingredients must be different' };
    }
    const list = substitutions[tripId] || (substitutions[tripId] = []);
    // одна правка на позицию блюда (замена/удаление) — как unique(trip,recipe,from) на бэкенде
    if (fromId != null && allTripEdits(tripId).some(s => s.recipeId === recipeId && String(s.fromIngredientId) === fromId)) {
      throw { status: 409, message: 'Conflict', detail: 'This position already has a trip-level edit' };
    }
    if (toId == null) {
      // мягкое удаление позиции «в рамках похода» (рецепт в каталоге не трогается)
      const created: MockSubstitution = {
        id: `rmv-${nextRemovedSeq()}`,
        recipeId,
        fromIngredientId: fromId,
        toIngredientId: null,
        amountPerServing: Number(body?.amountPerServing ?? 0),
        ratio: 1,
        added: false,
        removed: true,
        comment: body?.comment,
      };
      (removedItems[tripId] || (removedItems[tripId] = [])).push(created);
      return created;
    }
    const created: MockSubstitution = {
      id: `sub-${nextSubstitutionSeq()}`,
      recipeId,
      fromIngredientId: fromId,
      toIngredientId: toId,
      amountPerServing: Number(body?.amountPerServing ?? 0),
      ratio: Number(body?.ratio ?? 1) || 1,
      added: fromId == null,
      removed: false,
      comment: body?.comment,
    };
    list.push(created);
    return created;
  }

  // DELETE /trips/:id/substitutions/:subId
  if (parts.length === 4 && parts[2] === 'substitutions' && method === 'DELETE') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    const before = allTripEdits(tripId).length;
    substitutions[tripId] = (substitutions[tripId] || []).filter(s => s.id !== parts[3]);
    removedItems[tripId] = (removedItems[tripId] || []).filter(s => s.id !== parts[3]);
    return allTripEdits(tripId).length === before ? null : { status: 'deleted' };
  }

  // PUT /trips/:id/shopping-exclusions — идемпотентная замена набора.
  // Fix-5 / R2 (шаг 2): принимаем и legacy {ingredientIds: []} (глобальные),
  // и канон {items: [{ingredientId, dayDate|null}]} — по-дневные исключения.
  // Храним клиентскими ключами: '<id>' или '<dayDate>::<id>'.
  if (parts.length === 3 && parts[2] === 'shopping-exclusions' && method === 'PUT') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    const legacy = Array.isArray(body?.ingredientIds);
    const canon = Array.isArray(body?.items);
    if (!legacy && !canon) {
      throw { status: 400, message: 'Bad request', detail: 'Expected { ingredientIds: [] } or { items: [{ingredientId, dayDate?}] }' };
    }
    const keys: string[] = [];
    if (legacy) for (const x of body.ingredientIds) keys.push(String(x));
    if (canon) {
      for (const it of body.items) {
        if (it?.ingredientId == null) continue;
        keys.push(it.dayDate ? `${String(it.dayDate)}::${String(it.ingredientId)}` : String(it.ingredientId));
      }
    }
    shoppingExcluded[tripId] = keys;
    return keys.map(k => {
      const i = k.indexOf('::');
      return i < 0
        ? { ingredientId: k, dayDate: null }
        : { ingredientId: k.slice(i + 2), dayDate: k.slice(0, i) };
    });
  }

  // GET /trips/:id/shopping-exclusions — Fix-5 / R2 (шаг 2): объекты {ingredientId, dayDate|null}
  if (parts.length === 3 && parts[2] === 'shopping-exclusions' && method === 'GET') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    return (shoppingExcluded[tripId] || []).map(k => {
      const i = k.indexOf('::');
      return i < 0
        ? { ingredientId: k, dayDate: null }
        : { ingredientId: k.slice(i + 2), dayDate: k.slice(0, i) };
    });
  }

  // DELETE /trips/:id/shopping-exclusions/:ingredientId
  if (parts.length === 4 && parts[2] === 'shopping-exclusions' && method === 'DELETE') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    // Fix-5: DELETE по ingredientId снимает ВСЕ его исключения (глобальное и дневные)
    const target = String(parts[3]);
    shoppingExcluded[tripId] = (shoppingExcluded[tripId] || []).filter(
      x => x !== target && !x.endsWith(`::${target}`)
    );
    return null;
  }

  // POST /trips/:id/ingredient-removals — мягкое удаление продукта из блюда в рамках похода
  if (parts.length === 3 && parts[2] === 'ingredient-removals' && method === 'POST') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    const recipeId = String(body?.recipeId ?? '');
    const fromId = body?.fromIngredientId == null ? null : String(body.fromIngredientId);
    if (fromId == null) {
      throw { status: 400, message: 'Bad request', detail: 'fromIngredientId required' };
    }
    const list = removedItems[tripId] || (removedItems[tripId] = []);
    if (list.some(r => r.recipeId === recipeId && String(r.fromIngredientId) === fromId)) {
      return list.find(r => r.recipeId === recipeId && String(r.fromIngredientId) === fromId);
    }
    const created: MockSubstitution = {
      id: `rmv-${nextRemovedSeq()}`,
      recipeId,
      fromIngredientId: fromId,
      toIngredientId: null,
      amountPerServing: Number(body?.amountPerServing ?? 0),
      ratio: 1,
      added: false,
      removed: true,
      comment: body?.comment,
    };
    list.push(created);
    return created;
  }

  // DELETE /trips/:id/ingredient-removals/:removalId
  if (parts.length === 4 && parts[2] === 'ingredient-removals' && method === 'DELETE') {
    const tripId = parts[1];
    if (!trips.find(t => t.id === tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    removedItems[tripId] = (removedItems[tripId] || []).filter(r => r.id !== parts[3]);
    return null;
  }
  
  // GET /trips/:id/summary/person
  if (parts.length === 4 && parts[2] === 'summary' && parts[3] === 'person' && method === 'GET') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    
    // Простая реализация: возвращаем фиктивные данные
    const totalPersonMeals = 13; // Из FIX-1
    const defaultPeople = trip.defaultPeople || 4;
    
    // Получаем shopping data для расчёта
    const shoppingData = srv.handleTrips('GET', `/trips/${tripId}/summary/shopping`, null);
    
    return {
      ingredients: shoppingData.items.map((i: any) => ({
        ingredientName: i.ingredientName,
        unit: i.unit,
        amountPerDefaultPerson: i.totalAmount / defaultPeople,
        amountPerPersonMeal: i.totalAmount / totalPersonMeals,
        plannedCostPerDefaultPerson: i.plannedCost ? i.plannedCost / defaultPeople : null,
        actualCostPerDefaultPerson: i.actualCost ? i.actualCost / defaultPeople : null,
        plannedCostPerPersonMeal: i.plannedCost ? i.plannedCost / totalPersonMeals : null,
        actualCostPerPersonMeal: i.actualCost ? i.actualCost / totalPersonMeals : null
      })),
      tripSummary: {
        totalPlannedCost: shoppingData.totalPlannedCost,
        totalActualCost: shoppingData.totalActualCost,
        deltaPercent: shoppingData.deltaPercent,
        overriddenCount: shoppingData.overriddenCount,
        hasMissingPrices: shoppingData.hasMissingPrices,
        missingIngredients: shoppingData.missingIngredients,
        totalPersonMeals,
        plannedCostPerDefaultPerson: Math.round(shoppingData.totalPlannedCost / defaultPeople),
        actualCostPerDefaultPerson: Math.round(shoppingData.totalActualCost / defaultPeople),
        plannedCostPerPersonMeal: Math.round(shoppingData.totalPlannedCost / totalPersonMeals),
        actualCostPerPersonMeal: Math.round(shoppingData.totalActualCost / totalPersonMeals),
        caloriesPerPersonMeal: null // Не считаем в mock
      }
    };
  }
  
  // PUT /trips/:id/price-overrides (bulk)
  if (parts.length === 3 && parts[2] === 'price-overrides' && method === 'PUT') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    
    if (!Array.isArray(body)) {
      throw { status: 400, message: 'Bad request', detail: 'Expected array of overrides' };
    }
    
    if (!priceOverrides[tripId]) {
      priceOverrides[tripId] = {};
    }
    
    // CONTRACT-P1: override-ключ нормализуется ('ing1'→'1'), чтобы PUT работал
    // и со старыми фикстурами (ingredientId: 1), и с реальными id каталога (ing1).
    const normOverrideKey = (id: string) => String(id).replace(/^ing/, '');

    body.forEach((override: any) => {
      if (override.actualPrice === null) {
        delete priceOverrides[tripId][normOverrideKey(override.ingredientId)];
      } else {
        priceOverrides[tripId][normOverrideKey(override.ingredientId)] = {
          actualPrice: override.actualPrice,
          comment: override.comment
        };
      }
    });
    
    return { status: 'ok' };
  }
  
  // PUT /trips/:id/price-overrides/:ingredientId
  if (parts.length === 4 && parts[2] === 'price-overrides' && method === 'PUT') {
    const tripId = parts[1];
    // CONTRACT-P1: нормализация ключа ('ing1'→'1') — PUT принимает и id каталога, и старые фикстуры
    const ingredientId = String(parts[3]).replace(/^ing/, '');
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    
    if (!priceOverrides[tripId]) {
      priceOverrides[tripId] = {};
    }
    
    if (body.actualPrice === null) {
      delete priceOverrides[tripId][ingredientId];
    } else {
      priceOverrides[tripId][ingredientId] = {
        actualPrice: body.actualPrice,
        comment: body.comment
      };
    }
    
    return {
      ingredientId,
      actualPrice: body.actualPrice,
      comment: body.comment
    };
  }
  
  // DELETE /trips/:id/price-overrides/:ingredientId
  if (parts.length === 4 && parts[2] === 'price-overrides' && method === 'DELETE') {
    const tripId = parts[1];
    // CONTRACT-P1: та же нормализация ключа, что и в PUT ('ing1'→'1')
    const ingredientId = String(parts[3]).replace(/^ing/, '');
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    
    if (priceOverrides[tripId]) {
      delete priceOverrides[tripId][ingredientId];
    }
    
    return null;
  }
  
  // GET /trips/:id/price-overrides
  if (parts.length === 3 && parts[2] === 'price-overrides' && method === 'GET') {
    const tripId = parts[1];
    const trip = trips.find(t => t.id === tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    
    const overrides = priceOverrides[tripId] || {};
    // cleanup-п.8: ключи хранилища нормализованы CONTRACT-P1 ('ing1'→'1');
    // отдаём id каталога, чтобы клиентский пайплайн (deriveTripView/tripLoader)
    // матчил серверные чеки с позициями закупки (паритет real-режима).
    return Object.entries(overrides).map(([ingredientId, data]) => ({
      ingredientId: denormalizeOverrideKey(ingredientId),
      ...data
    }));
  }

  // POST /trips — создание похода (E2E-04/05: раньше роут отсутствовал,
  // TripsPage получал 405 и поход не появлялся в списке)
  if (parts.length === 1 && method === 'POST') {
    // Паритет с бэкендом (TripService.createTrip): владелец берётся из сессии,
    // а не хардкодом users[0]. Токен mock несёт id ('mock-access-token-<id>',
    // см. mockAuth /auth/me). Без этого поход, созданный не-админом, исчезал
    // из его списка: TripsPage фильтрует myTrips по userId (e2e navigation-п.10).
    const token = localStorage.getItem('accessToken') || '';
    const tokenMatch = token.match(/mock-access-token-(\d+)$/);
    const sessionUser = tokenMatch && users.find(u => u.id === tokenMatch[1]);
    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      userId: body?.userId ?? (sessionUser ? sessionUser.id : users[0].id),
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      defaultPeople: body.defaultPeople ?? 1,
      notes: body.notes,
      createdAt: new Date().toISOString(),
    };
    // Паритет с бэкендом (TripService.createTrip): дни создаются автоматически
    const days: any[] = [];
    const start = new Date(`${newTrip.startDate}T00:00:00`);
    const end = new Date(`${newTrip.endDate}T00:00:00`);
    for (let d = new Date(start), i = 0; d <= end; d.setDate(d.getDate() + 1), i++) {
      days.push({
        id: `d-${newTrip.id}-${i}`,
        tripId: newTrip.id,
        dayDate: d.toISOString().slice(0, 10),
        meals: [],
      });
    }
    (newTrip as any).days = days;
    trips.push(newTrip);
    return newTrip;
  }

  throw { status: 405, message: 'Method not allowed' };
}
