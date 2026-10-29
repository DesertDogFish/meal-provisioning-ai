/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * общее in-memory состояние мока (каталоги, правки, счётчики, пользователи) и сквозные помощники.
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import { mockIngredients, mockRecipes, mockTrips, mockProductCategories, mockPrices } from '../data/mockData';
import type { Ingredient, Recipe, Trip, ProductCategory, IngredientPrice } from '../types';
import { costOf } from '../utils/calculations';

// In-memory хранилище
export const products: Ingredient[] = [...mockIngredients];

export const categories: ProductCategory[] = [...mockProductCategories];

export const recipes: Recipe[] = [...mockRecipes];

export const trips: Trip[] = [...mockTrips];

// CONTRACT-P1 (PLAN.md Backlog п.1): цены как in-memory хранилище для DUPLICATE_PRICE_DATE
export const prices: IngredientPrice[] = [...mockPrices];

// Price overrides хранилище (tripId -> ingredientId -> override)
export const priceOverrides: Record<string, Record<string, { actualPrice: number; comment?: string }>> = {};

// Фаза 13 (п.5): soft-disable позиций закупки в рамках похода (не удаляя продукт)
export const shoppingExcluded: Record<string, string[]> = {};

// Фаза 13 (п.6): пер-походные замещения ингредиентов (TripIngredientSubstitution).
// Хранят дельту черновика состава блюда относительно каталога: from/to/ratio и
// добавленные вручную позиции (added=true). Закупка/дни/человек считают с ними.
export interface MockSubstitution {
  id: string;
  recipeId: string;
  fromIngredientId: string | null; // null = позиция добавлена руками
  toIngredientId: string | null;   // null = позиция мягко удалена из расчёта похода
  amountPerServing: number;        // количество на порцию (для расчёта закупки)
  ratio: number;
  added: boolean;
  removed?: boolean;               // true = мягкое удаление (рецепт в каталоге не тронут)
  comment?: string;
  /** FORM-meal-composition-spec: SCALED-правка хранится как «замена на себя» (from===to). */
  scale?: boolean;
  /** FORM-meal-composition-spec §3: EXTRA — АБСОЛЮТ на приём. Храним его напрямую
   * (absoluteAmount), чтобы пер-приёмные people не вносили дрейф округления при
   * round-trip per-serving↔абсолют (0,25/6×6 → 0,252 вместо 0,25). */
  absoluteAmount?: number;
  /** Composition-правки (§4) привязаны к приёму: PUT одного приёма не должен
   * снимать правки других приёмов того же рецепта (паритет с per-meal editSet). */
  mealId?: string;
}

export const substitutions: Record<string, MockSubstitution[]> = {};

let substitutionSeq = 1;

/** Фаза 13 (п.6): мягкое удаление позиции «в рамках похода» — то же замещение,
 * но с toIngredientId=null (продукт убирается из расчёта, рецепт в каталоге не меняется).
 * Legacy-хранилище removedItems объединяется с substitutions на чтении (GET/агрегация). */
export const removedItems: Record<string, MockSubstitution[]> = {};

let removedSeq = 1;

/**
 * U40 (список 26.10) / PLAN R3: ручные позиции закупки — продукты к дню или ко
 * всему походу ВНЕ блюд (антисептик, аптечка…). dayId=null → на весь поход.
 * Backend-задача R3: миграция `trip_manual_items` + контроллер с тем же контрактом.
 */
export interface MockManualItem {
  id: string;
  tripId: string;
  dayId: string | null;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  amount: number;
  note?: string;
  createdAt: string;
}

export const manualItems: Record<string, MockManualItem[]> = {};

let manualSeq = 1;

/** Все пер-походные правки состава (замещения + удаления) одним списком. */
export function allTripEdits(tripId: string): MockSubstitution[] {
  return [...(substitutions[tripId] || []), ...(removedItems[tripId] || [])];
}

/** Строка сводки/закупки mock-сервера (unit + цены нужны для пересчёта при правках). */
export type TripEditRow = {
  ingredientId: string;
  catalogId?: string;
  ingredientName?: string;
  unit: string;
  totalAmount: number;
  plannedUnitPrice: number | null;
  actualUnitPrice: number | null;
  plannedCost: number | null;
  actualCost: number | null;
  overridden: boolean;
  hasPlannedPrice?: boolean;
};

/** Актуальная плановая цена продукта из in-memory прайса (последняя по effectiveFrom). */
export function priceOf(catalogId: string): number | null {
  const list = prices
    .filter(p => p.ingredientId === catalogId)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return list.length ? list[list.length - 1].pricePerUnit : null;
}

/** Применение пер-походных правок к строкам закупки: from→to × ratio,
 * ручные добавления (from=null), удаления (to=null → сумма не считается). */
export function applyTripEditsToRows<T extends TripEditRow>(
  tripId: string,
  rows: T[],
  scaleAmount: (amountPerServing: number) => number,
): T[] {
  const edits = allTripEdits(tripId);
  if (!edits.length) return rows;
  const idOf = (r: T) => String(r.catalogId ?? r.ingredientId);
  const out: T[] = rows.map(r => ({ ...r }));
  /** Пересчёт стоимостей строки через costOf (базовые единицы × цена за базовую единицу). */
  const recalc = (r: T) => {
    const u = r.unit || 'KG';
    r.plannedCost = r.plannedUnitPrice != null ? costOf(r.totalAmount, u, r.plannedUnitPrice) : null;
    r.actualCost = r.actualUnitPrice != null ? costOf(r.totalAmount, u, r.actualUnitPrice) : null;
  };
  for (const e of edits) {
    const srcIdx = e.fromIngredientId == null ? -1 : out.findIndex(r => idOf(r) === String(e.fromIngredientId));
    if (e.toIngredientId == null) {
      // мягкое удаление позиции в рамках похода
      if (srcIdx >= 0) {
        const row = out[srcIdx];
        row.plannedCost = null;
        row.actualCost = null;
        row.overridden = false;
        row.actualUnitPrice = null;
      }
      continue;
    }
    if (srcIdx >= 0) {
      // замена from→to: количество переносим на 'to' с коэффициентом ratio
      const src = out[srcIdx];
      const amount = src.totalAmount * (e.ratio || 1);
      src.plannedCost = null;
      src.actualCost = null;
      src.overridden = false;
      src.actualUnitPrice = null;
      const dstIdx = out.findIndex(r => idOf(r) === String(e.toIngredientId));
      if (dstIdx >= 0) {
        const dst = out[dstIdx];
        dst.totalAmount = dst.totalAmount + amount;
        recalc(dst);
      } else {
        const product = products.find(pr => pr.id === String(e.toIngredientId));
        const p = priceOf(String(e.toIngredientId)) ?? src.plannedUnitPrice;
        const o = ovFor(tripId, String(e.toIngredientId));
        const addedRow: T = {
          ...src,
          ingredientId: String(e.toIngredientId),
          catalogId: String(e.toIngredientId),
          ingredientName: product?.name ?? 'Замещённый продукт',
          unit: product?.unit ?? src.unit,
          totalAmount: amount,
          plannedUnitPrice: p,
          actualUnitPrice: o?.actualPrice ?? p,
          overridden: !!o,
          hasPlannedPrice: p != null,
        };
        recalc(addedRow);
        out.push(addedRow);
      }
    } else {
      // позиция добавлена руками (from=null либо 'from' отсутствует в базовых строках)
      if (out.some(r => idOf(r) === String(e.toIngredientId))) continue;
      // §3/V21: EXTRA — абсолют на приём (absoluteAmount); scaleAmount-фолбэк — для
      // legacy-правок без абсолютного значения.
      const amount = e.absoluteAmount ?? scaleAmount(e.amountPerServing || 0);
      const product = products.find(pr => pr.id === String(e.toIngredientId));
      const p = priceOf(String(e.toIngredientId));
      const o = ovFor(tripId, String(e.toIngredientId));
      const manualRow: TripEditRow = {
        ingredientId: String(e.toIngredientId),
        catalogId: String(e.toIngredientId),
        ingredientName: product?.name ?? 'Новый продукт',
        unit: product?.unit ?? 'KG',
        totalAmount: amount,
        plannedUnitPrice: p,
        actualUnitPrice: o?.actualPrice ?? p,
        plannedCost: null,
        actualCost: null,
        overridden: !!o,
        hasPlannedPrice: p != null,
      };
      recalc(manualRow as unknown as T);
      out.push(manualRow as unknown as T);
    }
  }
  return out;
}

export function ovFor(tripId: string, rowIngredientId: string) {
  const key = String(rowIngredientId).replace(/^ing/, '');
  return priceOverrides[tripId]?.[key];
}

/** Фаза 13 (п.1): mock работает в jsdom-тестах — клиентский стейдж (tripStaging,
 * localStorage) виден и здесь. Читаем массив id по префиксу ключа вкладки браузера. */
export function loadClientStage(prefix: string, tripId: string): Record<string, true> {
  try {
    const raw = (globalThis as any).localStorage?.getItem(`${prefix}-${tripId}`);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    const out: Record<string, true> = {};
    if (Array.isArray(arr)) for (const x of arr) if (typeof x === 'string') out[x] = true;
    return out;
  } catch {
    return {};
  }
}

// Auth хранилище
export interface MockUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export const users: MockUser[] = [
  {
    id: '1',
    email: 'admin@provision.app',
    password: 'password123',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    createdAt: '2024-01-01'
  },
  {
    id: '2',
    email: 'user@provision.app',
    password: 'password123',
    firstName: 'John',
    lastName: 'Doe',
    role: 'USER',
    createdAt: '2024-01-15'
  }
];

// Утилиты
export const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

export const UNIT_LABELS: Record<string, string> = {
  KG: 'кг',
  L: 'л',
  PCS: 'шт',
  PACK: 'уп'
};

// Обработчик запросов
/** FORM-meal-composition-spec §3: scale 3 HALF_UP (эталон Java setScale(3, HALF_UP)). */
export const r3 = (x: number) => Math.round((x + Number.EPSILON) * 1000) / 1000;

export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Ключ recipe'а правки: допускает и каталожный id ('rec1'), и trip-scoped копию ('rec1::ttrip1'). */
export function editRecipeKey(recipeId: string | null | undefined): string {
  const rid = String(recipeId ?? '');
  return rid.includes('::t') ? rid.split('::t')[0] : rid;
}

/** Ключ ингредиента правки: каталожный 'ingN' или trip-scoped снепшот 'ingN::ttripX'. */
export function editIngredientKey(ingredientId: string | null | undefined): string {
  const iid = String(ingredientId ?? '');
  return iid.includes('::t') ? iid.split('::t')[0] : iid;
}


// Мутаторы счётчиков: ES-импорт — live binding только для чтения, `++` у
// импортёра не сработал бы, поэтому инкремент живёт в модуле-владельце.
export function nextSubstitutionSeq(): number {
  substitutionSeq += 1;
  return substitutionSeq;
}

export function nextRemovedSeq(): number {
  removedSeq += 1;
  return removedSeq;
}

export function nextManualSeq(): number {
  manualSeq += 1;
  return manualSeq;
}
