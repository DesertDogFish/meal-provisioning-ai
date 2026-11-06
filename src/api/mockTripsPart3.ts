import type { Trip } from '../types';

import { isoDay, MAX_CHECKLIST_BOUGHT_ITEMS } from './mockTripsShared';
import { nextRemovedSeq, products, trips, priceOverrides, shoppingExcluded, checklistActualQty, removedItems, users, findOwnTrip } from './mockState';
import { denormalizeOverrideKey } from './mockTripProgress'; // cleanup-п.8
import type { MockSubstitution, MockChecklistActualQtyItem } from './mockState';

let mockTripSeq = 0;

export function handleTripsPart3(srv: any, method: string, path: string, body?: any): any {
  const parts = path.split('/').filter(Boolean);


  // BL-27: GET/PUT /trips/:id/checklist-actual-qty — фактическое количество
  // («сколько реально берём/взяли», {amount, unit}) по позиции чеклиста.
  // Паритет с backend ChecklistActualQty: PUT — идемпотентная ПОЛНАЯ замена набора,
  // GET — [{ingredientId, amount, unit}]; дубли ingredientId схлопываются
  // (последнее значение выигрывает); неизвестный продукт → 404; кривая пара → 400.
  if (parts.length === 3 && parts[2] === 'checklist-actual-qty') {
    const tripId = parts[1];
    if (!findOwnTrip(tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    if (method === 'PUT') {
      const items = body?.items;
      if (!Array.isArray(items)) {
        throw {
          status: 400, message: 'Bad request',
          detail: 'Expected { items: [{ingredientId, amount, unit}] }',
        };
      }
      if (items.length > MAX_CHECKLIST_BOUGHT_ITEMS) {
        throw {
          status: 400, message: 'Bad request',
          detail: `Too many items: ${items.length} (max ${MAX_CHECKLIST_BOUGHT_ITEMS})`,
        };
      }
      const byId = new Map<string, MockChecklistActualQtyItem>();
      for (const it of items) {
        const ingredientId = it?.ingredientId;
        const amount = Number(it?.amount);
        const unit = typeof it?.unit === 'string' ? it.unit.trim() : '';
        // backend: @NotNull @Positive BigDecimal amount, @NotBlank @Size(max=16) unit
        if (ingredientId == null || String(ingredientId).trim() === ''
          || it?.amount == null || !Number.isFinite(amount) || amount <= 0
          || unit === '' || unit.length > 16) {
          throw {
            status: 400, message: 'Bad request',
            detail: 'Each item requires ingredientId, amount > 0 and non-empty unit (max 16 chars)',
          };
        }
        byId.set(String(ingredientId), { ingredientId, amount, unit });
      }
      // backend ищет продукт по id и отдаёт 404, если его нет
      for (const it of byId.values()) {
        if (!products.some(p => String(p.id) === String(it.ingredientId))) {
          throw {
            status: 404, message: 'Not found',
            detail: `Ingredient ${it.ingredientId} not found`,
          };
        }
      }
      checklistActualQty[tripId] = [...byId.values()];
      return checklistActualQty[tripId];
    }
    if (method === 'GET') return checklistActualQty[tripId] || [];
  }

  // PUT /trips/:id/shopping-exclusions — идемпотентная замена набора.
  // Fix-5 / R2 (шаг 2): принимаем и legacy {ingredientIds: []} (глобальные),
  // и канон {items: [{ingredientId, dayDate|null}]} — по-дневные исключения.
  // Храним клиентскими ключами: '<id>' или '<dayDate>::<id>'.
  if (parts.length === 3 && parts[2] === 'shopping-exclusions' && method === 'PUT') {
    const tripId = parts[1];
    if (!findOwnTrip(tripId)) {
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
    if (!findOwnTrip(tripId)) {
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
    if (!findOwnTrip(tripId)) {
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
    const trip = findOwnTrip(tripId);
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
    if (!findOwnTrip(tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    removedItems[tripId] = (removedItems[tripId] || []).filter(r => r.id !== parts[3]);
    return null;
  }
  
  // GET /trips/:id/summary/person
  if (parts.length === 4 && parts[2] === 'summary' && parts[3] === 'person' && method === 'GET') {
    const tripId = parts[1];
    const trip = findOwnTrip(tripId);
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
    const trip = findOwnTrip(tripId);
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
    const trip = findOwnTrip(tripId);
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
    const trip = findOwnTrip(tripId);
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
    const trip = findOwnTrip(tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    
    const overrides = priceOverrides[tripId] || {};
    // cleanup-п.8: ключи хранилища нормализованы CONTRACT-P1 ('ing1'→'1');
    // отдаём id каталога, чтобы клиентский пайплайн (deriveTripView/tripLoader)
    // матчил серверные чеки с позициями закупки (паритет real-режима).
    // BL-10: паритет с TripPriceOverrideResponse — единица продукта и валюта
    // рядом с actualPrice (цена за единицу), чтобы клиент писал «350,00 ₽/кг».
    return Object.entries(overrides).map(([ingredientId, data]) => {
      const publicId = denormalizeOverrideKey(ingredientId);
      const product = products.find(p => p.id === publicId) ?? products.find(p => p.id === ingredientId);
      return {
        ingredientId: publicId,
        ingredientName: product?.name,
        unit: product?.unit ?? null,
        currency: 'RUB',
        ...data,
      };
    });
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
      id: `trip-${Date.now()}-${++mockTripSeq}`,
      userId: body?.userId ?? (sessionUser ? sessionUser.id : users[0].id),
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      defaultPeople: body.defaultPeople ?? 1,
      notes: body.notes,
      menuApproved: false, // redesign п.2: новый поход — меню не утверждено
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
        dayDate: isoDay(d),
        meals: [],
      });
    }
    (newTrip as any).days = days;
    trips.push(newTrip);
    return newTrip;
  }

  throw { status: 405, message: 'Method not allowed' };
}
