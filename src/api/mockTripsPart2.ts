import { MAX_CHECKLIST_BOUGHT_ITEMS } from './mockTripsShared';
import { nextSubstitutionSeq, nextRemovedSeq, products, recipes, priceOverrides, shoppingExcluded, checklistBought, substitutions, removedItems, allTripEdits, applyTripEditsToRows, loadClientStage, UNIT_LABELS, editRecipeKey, editIngredientKey, findOwnTrip } from './mockState';
import { ingredientEditsFor } from './mockTripProgress'; // cleanup-п.8
import type { MockSubstitution, MockChecklistBoughtItem } from './mockState';

export function handleTripsPart2(srv: any, method: string, path: string, body?: any): any {
  const parts = path.split('/').filter(Boolean);


  // GET /trips/:id/summary/shopping
  if (parts.length === 4 && parts[2] === 'summary' && parts[3] === 'shopping' && method === 'GET') {
    const tripId = parts[1];
    const trip = findOwnTrip(tripId);
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
    if (!findOwnTrip(tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
    }
    // cleanup-п.8/п.9: обогащение правок — общий хелпер (mockTripProgress.ingredientEditsFor)
    return ingredientEditsFor(tripId);
  }

  // GET /trips/:id/substitutions
  if (parts.length === 3 && parts[2] === 'substitutions' && method === 'GET') {
    const tripId = parts[1];
    if (!findOwnTrip(tripId)) {
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
    const trip = findOwnTrip(tripId);
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
    if (!findOwnTrip(tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    const before = allTripEdits(tripId).length;
    substitutions[tripId] = (substitutions[tripId] || []).filter(s => s.id !== parts[3]);
    removedItems[tripId] = (removedItems[tripId] || []).filter(s => s.id !== parts[3]);
    return allTripEdits(tripId).length === before ? null : { status: 'deleted' };
  }

  // KB-15: GET/PUT /trips/:id/checklist-bought — отметки «взято» чеклиста похода.
  // Паритет с backend ChecklistBought: PUT — идемпотентная ПОЛНАЯ замена набора,
  // GET — та же форма [{ingredientId, neededStamp}] (neededStamp = needed*1000).
  // Валидация — как у сервера: неизвестный продукт → 404 (ingredientRepository
  // .findById(...).orElseThrow(NotFoundException)), кривой neededStamp → 400
  // (@NotNull @PositiveOrZero Long: null/дробное/отрицательное не проходят, а
  // 0 — ЛЕГАЛЬНО: нулевая потребность, ключ '<id>@0' из «взять всё»; Number(null)
  // === 0, поэтому null проверяем явно), слишком большой набор → 400 (защита от
  // «полной замены» на 10^5 строк).
  if (parts.length === 3 && parts[2] === 'checklist-bought') {
    const tripId = parts[1];
    if (!findOwnTrip(tripId)) {
      throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
    }
    if (method === 'PUT') {
      const items = body?.items;
      if (!Array.isArray(items)) {
        throw { status: 400, message: 'Bad request', detail: 'Expected { items: [{ingredientId, neededStamp}] }' };
      }
      if (items.length > MAX_CHECKLIST_BOUGHT_ITEMS) {
        throw {
          status: 400, message: 'Bad request',
          detail: `Too many items: ${items.length} (max ${MAX_CHECKLIST_BOUGHT_ITEMS})`,
        };
      }
      const desired: MockChecklistBoughtItem[] = [];
      for (const it of items) {
        const ingredientId = it?.ingredientId;
        const stamp = Number(it?.neededStamp);
        // backend: @NotNull @PositiveOrZero Long neededStamp → null/''/дробное/
        // отрицательное = 400; 0 валиден (нулевая потребность).
        if (ingredientId == null || String(ingredientId).trim() === ''
          || it?.neededStamp == null || !Number.isInteger(stamp) || stamp < 0) {
          throw {
            status: 400, message: 'Bad request',
            detail: 'Each item requires ingredientId and integer neededStamp >= 0',
          };
        }
        desired.push({ ingredientId, neededStamp: stamp });
      }
      // backend ищет продукт по id и отдаёт 404, если его нет
      for (const it of desired) {
        if (!products.some(p => String(p.id) === String(it.ingredientId))) {
          throw {
            status: 404, message: 'Not found',
            detail: `Ingredient ${it.ingredientId} not found`,
          };
        }
      }
      const byKey = new Map<string, MockChecklistBoughtItem>();
      for (const it of desired) byKey.set(`${it.ingredientId}@${it.neededStamp}`, it);
      checklistBought[tripId] = [...byKey.values()];
      return checklistBought[tripId];
    }
    if (method === 'GET') return checklistBought[tripId] || [];
  }
}
