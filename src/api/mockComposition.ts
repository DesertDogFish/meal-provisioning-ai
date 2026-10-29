/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * состав приёмов пищи: classifyMealEdits, handleMealComposition, applyCompositionPut, buildCompositionResponse.
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import type {  } from '../types';
import { nextSubstitutionSeq, nextRemovedSeq, products, recipes, trips, substitutions, removedItems, allTripEdits, priceOf, r3, r2, editRecipeKey, editIngredientKey } from './mockState';
import type { MockSubstitution } from './mockState';

/**
 * FORM-meal-composition-spec §4.4 (mock-паритет): разложение правок похода для
 * рецепта на категории — те же правила, что в MealCompositionService.buildResponse:
 * added/from=null → EXTRA; removed/to=null → EXCLUDE; from===to → SCALE; else → SUBST.
 */
export function classifyMealEdits(tripId: string, recipeId: string) {
  const scaleRatios: Record<string, number> = {};
  const extraAmounts: Record<string, number> = {}; // legacy: per-serving → абсолют = aps × people
  const extraAbsolutes: Record<string, number> = {}; // §3: абсолют на приём (хранится напрямую)
  const excluded = new Set<string>();
  const replacements: { id: string; fromIngredientId: string; toIngredientId: string; ratio: number }[] = [];
  const seenFrom = new Set<string>(); // одна замена на from-ингредиент (первая выигрывает)
  for (const s of allTripEdits(tripId)) {
    if (editRecipeKey(s.recipeId) !== editRecipeKey(recipeId)) continue;
    const from = s.fromIngredientId == null ? null : String(s.fromIngredientId);
    const to = s.toIngredientId == null ? null : String(s.toIngredientId);
    if (s.added || from == null) {
      // EXTRA: абсолют на приём храним напрямую (§3); amountPerServing — фолбэк для legacy-правок
      if (to != null && s.absoluteAmount != null) {
        extraAbsolutes[to] = s.absoluteAmount;
      } else if (to != null && s.amountPerServing != null) {
        extraAmounts[to] = s.amountPerServing;
      }
    } else if (s.removed || to == null) {
      excluded.add(from);
    } else if (from === to) {
      scaleRatios[from] = s.ratio ?? 1;
    } else {
      const rk = `${editRecipeKey(s.recipeId)}|${from}`; // дедуп по (рецепт+from): правки других рецептов не затеняют
      if (!seenFrom.has(rk)) {
        seenFrom.add(rk);
        replacements.push({ id: s.id, fromIngredientId: from, toIngredientId: to, ratio: s.ratio ?? 1 });
      }
    }
  }
  return { scaleRatios, extraAmounts, extraAbsolutes, excluded, replacements };
}

/** FORM-meal-composition-spec §3 (mock-паритет): нормализация количества позиции.
 * Двойное r3 при SCALE даёт дрейф округления (0,4/4×4=0,4 → ×1,5 → r3 → 0,25/6×6=0,252
 * вместо 0,25). Если значение с точностью до 1e-9 совпадает с «чистым» пересчётом без
 * промежуточного округления — возвращаем чистое. Все корректные результаты уже проходят
 * это условие (разница ≤1e-9), поэтому поведение для них не меняется. */
export const normQty = (rounded: number, clean: number) =>
  Math.abs(rounded - clean) <= 1e-9 ? clean : rounded;

/** Граммы позиции: KG/L → ×1000; PCS/PACK → qty × pieceWeightG (эталон Java weightOfGrams). */
export function mockWeightGrams(qty: number, unit?: string, pieceWeightG?: number | null): number {
  if (unit === 'KG' || unit === 'L') return qty * 1000;
  if (pieceWeightG != null && pieceWeightG > 0) return qty * pieceWeightG;
  return 0;
}

/** Ккал позиции: kcalPer100g × граммы / 100 (эталон Java kcalOf). */
export function mockKcalOf(qty: number, unit?: string, kcalPer100g?: number | null, pieceWeightG?: number | null): number {
  if (kcalPer100g == null) return 0;
  return (mockWeightGrams(qty, unit, pieceWeightG) * kcalPer100g) / 100;
}

  /**
   * FORM-meal-composition-spec §4.2/§4.4: GET/PUT /trips/:t/meals/:m/composition.
   * In-memory правки (substitutions-хранилище) трактуются ровно как на бэкенде
   * (MealCompositionService): SCALE = from===to, EXTRA = added (абсолют на приём,
   * хранится per-serving), EXCLUDE = removed/to=null, SUBST = from→to × ratio.
   */

export function handleMealCompositionImpl(srv: any, method: string, tripId: string, mealId: string, body?: any): any {
  const trip = trips.find(t => t.id === tripId);
  if (!trip) throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
  let day: any = null;
  let meal: any = null;
  for (const d of trip.days || []) {
    const m = (d.meals || []).find((x: any) => String(x.id) === String(mealId));
    if (m) { day = d; meal = m; }
  }
  if (!meal) throw { status: 404, message: 'Not found', detail: `Meal ${mealId} not found in trip` } as any;
  // Паритет с бэкендом: composition резолвит блюдо и по каталожному id ('rec1'),
  // и по trip-scoped копии ('rec1::ttrip1') — POST /days/:d/meals создаёт снепшот-копию.
  const baseRecipe: any =
    recipes.find(r => r.id === meal.recipeId) ??
    recipes.find(r => editRecipeKey(r.id) === editRecipeKey(meal.recipeId));
  if (!baseRecipe) throw { status: 404, message: 'Not found', detail: `Recipe ${meal.recipeId} not found` } as any;
  // Для расчётов берём базовый рецепт каталога: его ingredientIds совпадают с id
  // правок/ответа composition (каталожные 'ingN'), тогда как у trip-scoped копии
  // ссылки — снепшот-id ('ingN::ttrip1'), из-за чего строки терялись (undefined).
  const recipe: any =
    (baseRecipe as any).snapshotOf != null
      ? recipes.find(r => r.id === (baseRecipe as any).snapshotOf) ?? baseRecipe
      : baseRecipe;

  if (method === 'PUT') srv.applyCompositionPut(tripId, day, meal, recipe, body);
  return srv.buildCompositionResponse(trip, day, meal, recipe);
}

  /** Атомарный диф-коммит желаемого состояния (паритет с MealCompositionService.putComposition). */

export function applyCompositionPutImpl(tripId: string, day: any, meal: any, recipe: any, body: any): void {
  const items: any[] = body?.items ?? [];
  if (!Array.isArray(body?.items)) throw { status: 400, message: 'Bad request', detail: 'items are required' } as any;

  // Валидации спеки §4.2: state/amount/ratio > 0, дубли ingredientId → 400
  const seen = new Set<string>();
  for (const it of items) {
    const st = String(it.state ?? '');
    if (!['RECIPE', 'SCALED', 'EXTRA', 'EXCLUDED'].includes(st)) {
      throw { status: 400, message: 'Bad request', detail: `Unknown state: ${st}` } as any;
    }
    if (st === 'EXTRA' && !(Number(it.amount) > 0)) {
      throw { status: 400, message: 'Bad request', detail: 'EXTRA requires amount > 0' } as any;
    }
    if (st === 'SCALED' && !(Number(it.ratio) > 0)) {
      throw { status: 400, message: 'Bad request', detail: 'SCALED requires ratio > 0' } as any;
    }
    const key = String(it.ingredientId);
    if (seen.has(key)) throw { status: 400, message: 'Bad request', detail: `Duplicate ingredientId: ${key}` } as any;
    seen.add(key);
  }
  const subs: any[] = body?.substitutions ?? [];
  const subSeen = new Set<string>();
  for (const s of subs) {
    if (String(s.fromIngredientId) === String(s.toIngredientId)) {
      throw { status: 400, message: 'Bad request', detail: 'From and to ingredients must be different' } as any;
    }
    if (s.ratio != null && !(Number(s.ratio) > 0)) {
      throw { status: 400, message: 'Bad request', detail: 'substitution ratio must be > 0' } as any;
    }
    if (subSeen.has(String(s.fromIngredientId))) {
      throw { status: 400, message: 'Bad request', detail: `Duplicate substitution from: ${s.fromIngredientId}` } as any;
    }
    subSeen.add(String(s.fromIngredientId));
  }
  for (const id of [...seen, ...subs.flatMap(s => [String(s.fromIngredientId), String(s.toIngredientId)])]) {
    if (!products.find(p => p.id === id)) {
      throw { status: 404, message: 'Not found', detail: `Ingredient not found: ${id}` } as any;
    }
  }

  const list = substitutions[tripId] || (substitutions[tripId] = []);
  // Ключ правок — базовый id рецепта: composition-эндпоинт резолвит приёмы и по
  // каталожным ('rec1'), и по trip-scoped копиям ('rec1::ttrip1'); правки одного
  // рецепта должны находиться независимо от формы id (паритет с editRecipeKey).
  const recipeId = editRecipeKey(recipe.id);
  // Область PUT — ВСЕ composition-правки этого рецепта (по всем приёмам), а не
  // только текущего приёма: состав рецепта — единый набор правок для всех его
  // экземпляров в походе (паритет с бэкендом, где TripIngredientSubstitution
  // хранится per-trip+recipe). Фильтр по mealId ломал идемпотентность batch PUT
  // (тесты 4/5: cleanup-циклы и удаление старых SUBST не видели правки,
  // записанные с другим mealId).
  const editsOf = () => allTripEdits(tripId).filter(s => editRecipeKey(s.recipeId) === recipeId);
  const removeEdit = (s: MockSubstitution) => {
    substitutions[tripId] = (substitutions[tripId] || []).filter(x => x.id !== s.id);
    removedItems[tripId] = (removedItems[tripId] || []).filter(x => x.id !== s.id);
  };

  const keepScaled = new Set<string>();
  const keepExtra = new Set<string>();
  const keepExcluded = new Set<string>();

  // Desired-набор замен собираем ДО основного цикла. §3: если позиция уже
  // имеет живую SCALE-правка (from===to) и PUT добавляет замену этого же from
  // на другой to — это ПЕРЕНОС масштабированного количества на to, а не снятие
  // SCALE: desired-строка такого from остаётся SCALED (см. liveScaleFroms ниже),
  // SCALE-правка сохраняется, replacement переносит derived×ratio на to.
  type DesiredSub = { from: string; to: string; ratio: number };
  const desiredMap = new Map<string, DesiredSub>();
  const takenTos = new Set<string>();
  for (const dto of subs) {
    const from = editIngredientKey(String(dto.fromIngredientId));
    const to = editIngredientKey(String(dto.toIngredientId));
    if (desiredMap.has(from)) continue; // дубль from → 400 в валидации; на всякий случай первая wins
    if (takenTos.has(to)) continue; // to уже занят другой заменой
    takenTos.add(to);
    desiredMap.set(from, { from, to, ratio: Number(dto.ratio ?? 1) || 1 });
  }
  // Живые SCALE-правки (снимок ДО любых удалений этого PUT):
  const liveScaleFroms = new Set<string>(
    editsOf()
      .filter(s => s.scale === true && s.fromIngredientId != null &&
        String(s.fromIngredientId) === String(s.toIngredientId))
      .map(s => editIngredientKey(String(s.fromIngredientId))),
  );
  // §3: замена от масштабированной позиции НЕ должна попадать в cleanup-сканы,
  // снимающие SCALE (from===to) «замещаемых» позиций — иначе потеряем переносимое
  // количество (0,2 → 0,1). Выносим такие замены из desiredMap в substFromScaled:
  // их SUBST-правка upsert'ится отдельно (keptFroms/substFromScaled ниже).
  const substFromScaled = new Map<string, DesiredSub>();
  for (const [from, d] of [...desiredMap.entries()]) {
    if (liveScaleFroms.has(from)) {
      desiredMap.delete(from);
      substFromScaled.set(from, d);
    }
  }
  const desiredSubs = [...desiredMap.values()];

  // УДАЛЕНИЕ старых правок выполняем ДО записи новых: иначе freshly-pushed
  // SCALE/SUBST-правки этого же PUT попадают в cleanup-скан и удаляются
  // (keep*-множества заполняются только ниже). Идемпотентность batch PUT
  // при этом сохраняется: повтор тела upsert'ит существующие правки.
  const isSubstEdit = (s: MockSubstitution) =>
    !s.added && !s.removed && s.fromIngredientId != null && s.toIngredientId != null &&
    String(s.fromIngredientId) !== String(s.toIngredientId);
  for (const s of editsOf()) {
    const from = s.fromIngredientId == null ? null : String(s.fromIngredientId);
    const to = s.toIngredientId == null ? null : String(s.toIngredientId);
    const fromKey = from == null ? null : editIngredientKey(from);
    const toKey = to == null ? null : editIngredientKey(to);
    if (s.added || from == null) {
      if (toKey != null && !desiredMap.has(toKey) && !(subs.length === 0)) {
        // EXTRA-правка останется живой только если её to снова придёт как EXTRA
        // в основном цикле ниже — здесь ещё не знаем; см. keepExtra-проход после.
      }
    } else if (from === to) {
      // §3 carry-over: SCALE замещаемой позиции НЕ снимается — замена переносит
      // масштабированное количество на to. Снятие живёт в substFromScaled-логике,
      // а «полная очистка» ниже сохранит её через keepScaled (см. основной цикл).
      if (!substFromScaled.has(fromKey!)) {
        // SCALE: снимаем, если позиция замещается (substTarget) или более не SCALED
        const substTarget = desiredMap.get(fromKey!);
        if ((substTarget && substTarget.to !== fromKey)) removeEdit(s);
      }
    } else if (isSubstEdit(s)) {
      // §3: замена от live-SCALE позиции живёт в substFromScaled — она сохраняется,
      // только если её to снова приходит как SCALED-строка в ТЕЛЕ этого PUT
      // (carry-over из live SCALE). Иначе desired для неё нет — снимаем.
      const inBody = toKey != null && items.some(itx =>
        String(itx.ingredientId) === toKey && String(itx.state ?? '') === 'SCALED');
      const target = toKey == null ? undefined : (desiredMap.get(fromKey!) ?? (inBody ? substFromScaled.get(fromKey!) : undefined));
      if (!target || target.to !== toKey) removeEdit(s); // изменённый/снятый SUBST
    } else if (s.removed || to == null) {
      // EXCLUDE: снимаем, если позиция больше не исключена (решает основной цикл)
    }
  }
  // Дедуп SUBST по from (§4.2): одна активная замена на from; лишние снимаем.
  const seenSubFrom = new Set<string>();
  for (const s of editsOf().filter(x => isSubstEdit(x))) {
    const fk = editIngredientKey(String(s.fromIngredientId));
    if (seenSubFrom.has(fk)) removeEdit(s);
    else seenSubFrom.add(fk);
  }
  // Второй проход cleanup для EXTRA/EXCLUDED/SCALE без замены — после основного
  // цикла, по keep*-множествам (см. ниже). Здесь только предварительная чистка
  // дублей SUBST и конфликтующих SCALE.

  // §3: liveScaleFroms/desiredMap уже вычислены выше (до cleanup-скана).
  for (const src of items) {
    let it = { ...src }; // копия: допускаем нормализацию state ниже (RECIPE→SCALED при переносе замены)
    const ingId = String(it.ingredientId);
    let st = String(it.state);
    if (st === 'RECIPE' && liveScaleFroms.has(editIngredientKey(ingId)) && substFromScaled.has(editIngredientKey(ingId))) {
      // извлечение scale-ratio из живой SCALE-правки для сохранения SCALED-строки
      const sc = editsOf().find(s => s.scale === true && s.fromIngredientId != null &&
        String(s.fromIngredientId) === String(s.toIngredientId) &&
        editIngredientKey(String(s.fromIngredientId)) === editIngredientKey(ingId));
      if (sc) { it = { ...it, state: 'SCALED', ratio: sc.ratio }; st = 'SCALED'; }
    }
    // §3 carry-over: если позиция в теле PUT явно SCALED и при этом заменяется
    // (substFromScaled), нормализуем её к SCALED — иначе cleanup ниже ошибочно
    // снимет живую SCALE-правка (keepScaled не заполнится для этого from).
    if (st === 'SCALED' && substFromScaled.has(editIngredientKey(ingId))) {
      keepScaled.add(editIngredientKey(ingId));
    }
    if (st === 'SCALED') {
      const ingKey = editIngredientKey(ingId); // правки храним под каталожным id (composition-расчёты идут по базовому рецепту)
      // §3: если этот же from заменяется на другой to — SCALE-правка НЕ нужна
      // (замена сама перенесёт масштабированное количество на to), и её запись
      // здесь создала бы конфликтующий дубль. Такой from остаётся RECIPE-строкой,
      // которую цикл замен обнулит после переноса.
      const substTarget = desiredMap.get(ingKey);
      if (substTarget && substTarget.to !== ingKey) continue;
      keepScaled.add(ingKey);
      const ex = editsOf().find(s => !s.added && s.fromIngredientId != null && s.toIngredientId == null && editIngredientKey(s.fromIngredientId) === ingKey);
      if (ex) removeEdit(ex); // SCALED поверх EXCLUDED снимает исключение
      const existing = editsOf().find(s => s.fromIngredientId != null && editIngredientKey(s.fromIngredientId) === ingKey && editIngredientKey(s.toIngredientId) === ingKey);
      if (existing) existing.ratio = Number(it.ratio);
      else list.push({
        id: `sub-${nextSubstitutionSeq()}`, recipeId, fromIngredientId: ingKey, toIngredientId: ingKey,
        amountPerServing: 0, ratio: Number(it.ratio), added: false, removed: false, scale: true,
        mealId: String(meal.id), comment: 'SCALE via composition',
      });
    } else if (st === 'EXTRA') {
      keepExtra.add(editIngredientKey(ingId));
      // §3: EXTRA — абсолют на приём. Храним его напрямую (absoluteAmount) +
      // per-serving-фолбэк для конвейера закупки; прямой absolute round-trip
      // без дрейфа округления при смене people (0,25 → 0,25, а не 0,25/6×6=0,252).
      const abs = Number(it.amount);
      // V21-паритет с реальным бэкендом: amount_per_serving added-строки хранит
      // АБСОЛЮТ на приём (без деления на people — SummaryService не масштабирует
      // absolute-строки). absoluteAmount сохранён как страховка для legacy-читателей.
      // Целевой id правки — КАТАЛОЖНЫЙ ингредиент ('ing8'), а не trip-scoped снепшот
      // ('ing8::ttrip1'): composition резолвит расчёты по базовому рецепту (паритет с бэкендом).
      const targetId = editIngredientKey(ingId);
      const existing = editsOf().find(s => (s.added || s.fromIngredientId == null) && String(s.toIngredientId) === targetId);
      if (existing) { existing.absoluteAmount = abs; existing.amountPerServing = abs; }
      else list.push({
        id: `sub-${nextSubstitutionSeq()}`, recipeId, fromIngredientId: null, toIngredientId: targetId,
        amountPerServing: abs, absoluteAmount: abs, ratio: 1, added: true, removed: false,
        mealId: String(meal.id), comment: 'EXTRA via composition',
      });
    } else if (st === 'EXCLUDED') {
      keepExcluded.add(editIngredientKey(ingId));
      const ingKey = editIngredientKey(ingId);
      const has = editsOf().some(s => s.removed || (s.fromIngredientId != null && s.toIngredientId == null && editIngredientKey(s.fromIngredientId) === ingKey));
      if (!has) {
        const created: MockSubstitution = {
          id: `rmv-${nextRemovedSeq()}`, recipeId, fromIngredientId: ingKey, toIngredientId: null,
          amountPerServing: 0, ratio: 1, added: false, removed: true,
          mealId: String(meal.id), comment: 'EXCLUDE via composition',
        };
        (removedItems[tripId] || (removedItems[tripId] = [])).push(created);
      }
    }
  }
  // Снимаем правки, которых нет в desired-состоянии (state=RECIPE или позиция исчезла)
  for (const s of editsOf()) {
    const from = s.fromIngredientId == null ? null : String(s.fromIngredientId);
    const to = s.toIngredientId == null ? null : String(s.toIngredientId);
    const fromKey = from == null ? null : editIngredientKey(from);
    const toKey = to == null ? null : editIngredientKey(to);
    if (s.added || from == null) {
      if (toKey != null && !keepExtra.has(toKey)) removeEdit(s);
    } else if (s.removed || to == null) {
      if (fromKey != null && !keepExcluded.has(fromKey)) removeEdit(s);
    } else if (from === to) {
      if (fromKey != null && !keepScaled.has(fromKey)) removeEdit(s);
    }
  }
  // Замены: полная замена набора from→to. Desired-набор собран выше (до
  // основного цикла). Если два from идут на один to — первая замена
  // выигрывает, вторая игнорируется (§4.2).
  const isSubst = (s: MockSubstitution) =>
    !s.added && !s.removed && s.fromIngredientId != null && s.toIngredientId != null &&
    String(s.fromIngredientId) !== String(s.toIngredientId);
  // §3: desiredMap уже НЕ содержит замен от позиций с live SCALE (они вынесены
  // в substFromScaled), поэтому SCALE-правки в основном cleanup не снимаются.
  const keptFroms = new Set<string>();
  for (const s of editsOf().filter(x => isSubst(x))) {
    const sFrom = editIngredientKey(String(s.fromIngredientId));
    const sTo = s.toIngredientId == null ? null : editIngredientKey(String(s.toIngredientId));
    const target = sTo == null ? undefined : desiredMap.get(sFrom);
    if (target && target.to === sTo && !keptFroms.has(sFrom)) {
      keptFroms.add(sFrom); // upsert: существующая правка уже соответствует desired
      continue;
    }
    removeEdit(s);
  }
  // Замена ОТ масштабированной позиции: сама SCALE-правка остаётся живой
  // (её from обнуляется в build через replacements), а SUBST from→to записывается
  // upsert'ом — при идемпотентном повторе существующая идентичная правка сохраняется.
  for (const d of [...desiredSubs, ...substFromScaled.values()]) {
    if (keptFroms.has(d.from)) continue;
    list.push({
      id: `sub-${nextSubstitutionSeq()}`, recipeId,
      fromIngredientId: d.from, toIngredientId: d.to,
      amountPerServing: 0, ratio: d.ratio, added: false, removed: false,
      mealId: String(meal.id), comment: 'SUBST via composition',
    });
  }
}

  /** Сборка ответа composition — тот же порядок, что §3 и buildResponse на Java. */

export function buildCompositionResponseImpl(trip: any, day: any, meal: any, recipe: any): any {
  const people = meal.peopleOverride ?? day.peopleOverride ?? trip.defaultPeople ?? 1;
  const baseServings = recipe.baseServings && recipe.baseServings > 0 ? recipe.baseServings : 1;
  const { scaleRatios, extraAmounts, extraAbsolutes, excluded, replacements } = classifyMealEdits(trip.id, recipe.id);

  type CompItem = Record<string, any>;
  const itemsById = new Map<string, CompItem>();
  const effective = new Map<string, number>();

  const mkItem = (p: any, base: number | null, derived: number | null, eff: number,
                  state: string, ratio: number | null, substitutedFrom: string | null): CompItem => ({
    ingredientId: p.id, name: p.name, unit: p.unit, packSize: p.packSize ?? null,
    pieceWeightG: p.pieceWeightG ?? null, kcalPer100g: p.kcalPer100g ?? null,
    baseAmountPerServing: base, derivedAmount: derived, effectiveAmount: eff,
    state, ratio, substitutedFrom,
  });

  // Продукт позиции: composition всегда отдаёт КАТАЛОЖНЫЕ id ('ingN'), даже если
  // расчёт идёт по trip-scoped копии рецепта/продуктов ('ingN::ttripX').
  const compProduct = (id: string | null | undefined): any => {
    if (id == null) return null;
    const direct = products.find(x => x.id === String(id));
    if (!direct) return null;
    return (direct as any).snapshotOf != null ? products.find(x => x.id === (direct as any).snapshotOf) ?? direct : direct;
  };

  for (const ri of recipe.ingredients || []) {
    const p = compProduct(ri.ingredientId);
    if (!p) continue;
    if (excluded.has(String(ri.ingredientId))) {
      itemsById.set(p.id, mkItem(p, ri.amount, null, 0, 'EXCLUDED', null, null));
      effective.set(p.id, 0);
      continue;
    }
    const ratio = scaleRatios[String(ri.ingredientId)];
    // §3: SCALE поверх рецептурного количества — без двойного r3 (дрейф 0,25→0,252):
    // чистый пересчёт base/baseServings×people×ratio, нормализация к эталону r3.
    let derived = normQty(r3((ri.amount / baseServings) * people), (ri.amount / baseServings) * people);
    if (ratio != null) {
      derived = normQty(r3(derived * ratio), (ri.amount / baseServings) * people * ratio);
    }
    itemsById.set(p.id, mkItem(p, ri.amount, derived, derived, ratio != null ? 'SCALED' : 'RECIPE', ratio ?? null, null));
    effective.set(p.id, derived);
  }
  for (const [id, aps] of Object.entries(extraAmounts)) {
    const p = compProduct(id);
    if (!p) continue;
    const abs = r3(aps * people); // пер-serving обратно в абсолют на приём (legacy-фолбэк)
    itemsById.set(p.id, mkItem(p, null, null, abs, 'EXTRA', null, null));
    effective.set(p.id, abs);
  }
  for (const [id, abs] of Object.entries(extraAbsolutes)) {
    // §3: EXTRA — абсолют на приём хранится напрямую, НЕ масштабируется при смене людей
    const p = compProduct(id);
    if (!p) continue;
    itemsById.set(p.id, mkItem(p, null, null, abs, 'EXTRA', null, null));
    effective.set(p.id, abs);
  }

  // substitutions: qty[to] += qty[from]×ratio; qty[from]:=0; state наследуется (§3)
  const subDtos: any[] = [];
  for (const s of replacements) {
    const fromItem = itemsById.get(s.fromIngredientId);
    const toItem = itemsById.get(s.toIngredientId);
    const qtyFrom = effective.get(s.fromIngredientId) ?? 0;
    const moved = r3(qtyFrom * s.ratio);
    const baseTo = toItem ? toItem.effectiveAmount : 0;
    let newState = toItem ? toItem.state : 'RECIPE';
    let newRatio = toItem ? toItem.ratio : null;
    if (!toItem || newState === 'RECIPE') {
      if (fromItem?.state === 'SCALED') { newState = 'SCALED'; newRatio = scaleRatios[s.fromIngredientId] ?? null; }
      else if (fromItem?.state === 'EXTRA') newState = 'EXTRA';
    }
    const toP = compProduct(s.toIngredientId);
    const fromP = compProduct(s.fromIngredientId);
    // §3: источник обнуляем ДО начисления на to — иначе при to===from в одном
    // PUT замена и SCALE одной позиции взаимно затеняют друг друга.
    if (fromItem) {
      itemsById.set(fromItem.ingredientId, { ...fromItem, effectiveAmount: 0 });
      effective.set(s.fromIngredientId, 0);
    }
    if (toP) {
      const newEff = normQty(r3(baseTo + moved), baseTo + moved);
      itemsById.set(toP.id, toItem
        ? { ...toItem, effectiveAmount: newEff, state: newState, ratio: newRatio, substitutedFrom: fromP?.name ?? null }
        : mkItem(toP, null, null, newEff, newState, newRatio, fromP?.name ?? null));
      effective.set(toP.id, newEff);
    }
    subDtos.push({
      id: s.id, fromIngredientId: s.fromIngredientId, fromName: fromP?.name ?? '',
      toIngredientId: s.toIngredientId, toName: toP?.name ?? '', ratio: s.ratio,
    });
  }

  // totals: ккал, вес (г), план-стоимость (₽ scale 2)
  let kcal = 0, weightGrams = 0, plannedCost = 0;
  const items = [...itemsById.values()].map(i => {
    const qty = i.effectiveAmount ?? 0;
    const kcalTotal = qty > 0 ? r3(mockKcalOf(qty, i.unit, i.kcalPer100g, i.pieceWeightG)) : 0;
    if (qty > 0) {
      kcal += mockKcalOf(qty, i.unit, i.kcalPer100g, i.pieceWeightG);
      weightGrams += mockWeightGrams(qty, i.unit, i.pieceWeightG);
      const price = priceOf(i.ingredientId);
      if (price != null) plannedCost += qty * price;
    }
    return { ...i, kcalTotal };
  });

  return {
    mealId: meal.id, dayDate: day.dayDate, mealType: meal.mealType, people,
    // recipe в mock уже резолвится к базовому каталожному блюду; catalogRecipeId —
    // паритет с backend CompositionResponse (id ГЛОБАЛЬНОГО рецепта для «Изменить
    // блюдо в справочнике» — meal.recipeId может быть trip-scoped снепшотом).
    baseServings, recipeId: recipe.id, catalogRecipeId: recipe.id, recipeName: recipe.name,
    items, substitutions: subDtos,
    totals: { kcal: r3(kcal), weightGrams: r3(weightGrams), plannedCost: r2(plannedCost) },
  };
}
