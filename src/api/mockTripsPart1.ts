import type { Trip } from '../types';

import { isoDay, MAX_CHECKLIST_BOUGHT_ITEMS } from './mockTripsShared';
import { nextSubstitutionSeq, nextRemovedSeq, nextManualSeq, products, recipes, trips, priceOverrides, shoppingExcluded, checklistBought, checklistActualQty, substitutions, removedItems, manualItems, allTripEdits, applyTripEditsToRows, loadClientStage, users, UNIT_LABELS, r3, r2, editRecipeKey, editIngredientKey, findOwnTrip, ownTripOr404, takeConcurrentConflict } from './mockState';
import { tripPricesFor, ingredientEditsFor, tripsWithProgress, denormalizeOverrideKey } from './mockTripProgress'; // cleanup-п.8
import type { MockSubstitution, MockManualItem, MockChecklistBoughtItem, MockChecklistActualQtyItem } from './mockState';

export function handleTripsPart1(srv: any, method: string, path: string, body?: any): any {
  const parts = path.split('/').filter(Boolean);

  // BL-41 (AU-13): инъекция 409 CONCURRENT_MODIFICATION для контракт-/e2e-сценариев
  // диалога «данные изменились» (R3 mock-паритет). Срабатывает на ПЕРВОЙ не-GET
  // мутации помеченного похода и снимается — настоящая гонка в in-memory моке
  // невозможна (клиент не передаёт версию агрегата).
  if (method !== 'GET' && parts[0] === 'trips' && parts[1] && takeConcurrentConflict(parts[1])) {
    throw {
      status: 409,
      title: 'Conflict',
      detail: 'CONCURRENT_MODIFICATION: Данные изменились, пока вы их редактировали. '
        + 'Обновите страницу и повторите правку.',
    };
  }

  // V20: цены похода — по trip-scoped копиям продуктов; если снепшотов нет
  // (legacy/сид-походы) — фолбэк на глобальный срез, как TripPriceController
  if (method === 'GET' && parts.length === 3 && parts[2] === 'prices') {
    const tripId = parts[1];
    if (!findOwnTrip(tripId)) {
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
    const trip = findOwnTrip(tripId);
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
    const trip = findOwnTrip(tripId);
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
    const trip = findOwnTrip(tripId);
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
    const trip = findOwnTrip(parts[1]);
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
  // (паритет backend TripService.getUserTrips → TripProgressService).
  // KB-34: только походы текущей сессии — как findByUserId на бэкенде.
  if (parts.length === 1 && method === 'GET') {
    return tripsWithProgress();
  }
  
  // PUT /trips/:id — U36 (список 26.10): полноценное редактирование похода.
  // Имя/заметки/люди — всегда; смена дат — с перегенерацией дней (план по дням
  // стирается, состав-правки похода снимаются). Backend-задача: снять запрет
  // «Cannot change trip dates» в TripService.updateTrip и повторить эту семантику.
  if (parts.length === 2 && method === 'PUT') {
    const tripId = parts[1];
    const trip = findOwnTrip(tripId);
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
        const iso = isoDay(d);
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
    const trip = findOwnTrip(tripId);
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
    // KB-34: чужой поход — 404 до всякой мутации (раньше роут поход не резолвил)
    ownTripOr404(tripId);
    const list = manualItems[tripId] || [];
    const idx = list.findIndex(x => x.id === parts[3]);
    if (idx === -1) {
      throw { status: 404, message: 'Not found', detail: `Manual item ${parts[3]} not found` } as any;
    }
    list.splice(idx, 1);
    return null;
  }

  // trip-workflow-redesign п.2/п.3: toggle утверждения меню ① — паритет с
  // POST /api/v1/trips/{id}/menu-approval (owner-only: findOwnTrip, иначе 404).
  if (parts.length === 3 && parts[2] === 'menu-approval' && method === 'POST') {
    const trip = findOwnTrip(parts[1]);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${parts[1]} not found` };
    }
    trip.menuApproved = !trip.menuApproved;
    return trip;
  }

  // GET /trips/:id
  if (parts.length === 2 && method === 'GET') {
    const tripId = parts[1];
    const trip = findOwnTrip(tripId);
    if (!trip) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    return trip;
  }
  
  // V20: trip-scoped копии блюд похода (паритет с GET /api/v1/trips/{id}/recipes)
  if (parts.length === 3 && parts[2] === 'recipes' && method === 'GET') {
    const tripId = parts[1];
    if (!findOwnTrip(tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    }
    return recipes
      .filter(r => (r as any).tripId === tripId)
      .map(r => srv.recipeToResponse(r));
  }
}
