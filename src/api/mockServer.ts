/**
 * CR-5: Mock-сервер для прототипа
 * Эмулирует API бэкенда с in-memory базой данных
 */

import { mockIngredients, mockRecipes, mockTrips, mockProductCategories, mockPrices } from '../data/mockData';
import { Ingredient, Recipe, Trip, ProductCategory, IngredientPrice } from '../types';
import { calculateRecipeKcal } from '../utils/calc';
// BUGFIX (284 046 ₽): стоимость = базовые единицы × цена за базовую единицу.
import { costOf } from '../utils/calculations';

// In-memory хранилище
const products: Ingredient[] = [...mockIngredients];
const categories: ProductCategory[] = [...mockProductCategories];
const recipes: Recipe[] = [...mockRecipes];
const trips: Trip[] = [...mockTrips];
// CONTRACT-P1 (PLAN.md Backlog п.1): цены как in-memory хранилище для DUPLICATE_PRICE_DATE
const prices: IngredientPrice[] = [...mockPrices];

// CONTRACT-P1: состояние синхронизации интеграций для SYNC_ALREADY_RUNNING
let syncRunning = false;

// Price overrides хранилище (tripId -> ingredientId -> override)
const priceOverrides: Record<string, Record<string, { actualPrice: number; comment?: string }>> = {};

// Фаза 13 (п.5): soft-disable позиций закупки в рамках похода (не удаляя продукт)
const shoppingExcluded: Record<string, string[]> = {};

// Фаза 13 (п.6): пер-походные замещения ингредиентов (TripIngredientSubstitution).
// Хранят ДЛЬТУ черновика состава блюда относительно каталога: from/to/ratio и
// добавленные вручную позиции (added=true). Закупка/дни/человек считают с ними.
interface MockSubstitution {
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
const substitutions: Record<string, MockSubstitution[]> = {};
let substitutionSeq = 1;

/** Фаза 13 (п.6): мягкое удаление позиции «в рамках похода» — то же замещение,
 * но с toIngredientId=null (продукт убирается из расчёта, рецепт в каталоге не меняется).
 * Legacy-хранилище removedItems объединяется с substitutions на чтении (GET/агрегация). */
const removedItems: Record<string, MockSubstitution[]> = {};
let removedSeq = 1;

/** Все пер-походные правки состава (замещения + удаления) одним списком. */
function allTripEdits(tripId: string): MockSubstitution[] {
  return [...(substitutions[tripId] || []), ...(removedItems[tripId] || [])];
}

/** Строка сводки/закупки mock-сервера (unit + цены нужны для пересчёта при правках). */
type TripEditRow = {
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
function priceOf(catalogId: string): number | null {
  const list = prices
    .filter(p => p.ingredientId === catalogId)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return list.length ? list[list.length - 1].pricePerUnit : null;
}

/** Применение пер-походных правок к строкам закупки: from→to × ratio,
 * ручные добавления (from=null), удаления (to=null → сумма не считается). */
function applyTripEditsToRows<T extends TripEditRow>(
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
      const amount = scaleAmount(e.amountPerServing || 0);
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

function ovFor(tripId: string, rowIngredientId: string) {
  const key = String(rowIngredientId).replace(/^ing/, '');
  return priceOverrides[tripId]?.[key];
}

/** Фаза 13 (п.1): mock работает в jsdom-тестах — клиентский стейдж (tripStaging,
 * localStorage) виден и здесь. Читаем массив id по префиксу ключа вкладки браузера. */
function loadClientStage(prefix: string, tripId: string): Record<string, true> {
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
interface MockUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

const users: MockUser[] = [
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
const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

const UNIT_LABELS: Record<string, string> = {
  KG: 'кг',
  L: 'л',
  PCS: 'шт',
  PACK: 'уп'
};

// CONTRACT-P1 (PLAN.md Backlog п.1): где продукт занят — для PRODUCT_IN_USE.usedIn
function findUsedIn(productId: string): { resourceType: string; resourceId: string; resourceName: string }[] {
  const usedIn: { resourceType: string; resourceId: string; resourceName: string }[] = [];
  for (const r of recipes) {
    if (r.ingredients.some(i => i.ingredientId === productId)) {
      usedIn.push({ resourceType: 'RECIPE', resourceId: r.id, resourceName: r.name });
    }
  }
  for (const t of trips) {
    const inTrip = (t.days || []).some(d =>
      (d.meals || []).some(m => {
        const rec = recipes.find(rr => rr.id === m.recipeId);
        return rec?.ingredients.some(i => i.ingredientId === productId);
      })
    );
    if (inTrip) usedIn.push({ resourceType: 'TRIP', resourceId: t.id, resourceName: t.name });
  }
  return usedIn;
}

// Обработчик запросов
/** FORM-meal-composition-spec §3: scale 3 HALF_UP (эталон Java setScale(3, HALF_UP)). */
const r3 = (x: number) => Math.round((x + Number.EPSILON) * 1000) / 1000;
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/**
 * FORM-meal-composition-spec §4.4 (mock-паритет): разложение правок похода для
 * рецепта на категории — те же правила, что в MealCompositionService.buildResponse:
 * added/from=null → EXTRA; removed/to=null → EXCLUDE; from===to → SCALE; else → SUBST.
 */
function classifyMealEdits(tripId: string, recipeId: string) {
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

/** Ключ recipe'а правки: допускает и каталожный id ('rec1'), и trip-scoped копию ('rec1::ttrip1'). */
function editRecipeKey(recipeId: string | null | undefined): string {
  const rid = String(recipeId ?? '');
  return rid.includes('::t') ? rid.split('::t')[0] : rid;
}

/** Ключ ингредиента правки: каталожный 'ingN' или trip-scoped снепшот 'ingN::ttripX'. */
function editIngredientKey(ingredientId: string | null | undefined): string {
  const iid = String(ingredientId ?? '');
  return iid.includes('::t') ? iid.split('::t')[0] : iid;
}

/** FORM-meal-composition-spec §3 (mock-паритет): нормализация количества позиции.
 * Двойное r3 при SCALE даёт дрейф округления (0,4/4×4=0,4 → ×1,5 → r3 → 0,25/6×6=0,252
 * вместо 0,25). Если значение с точностью до 1e-9 совпадает с «чистым» пересчётом без
 * промежуточного округления — возвращаем чистое. Все корректные результаты уже проходят
 * это условие (разница ≤1e-9), поэтому поведение для них не меняется. */
const normQty = (rounded: number, clean: number) =>
  Math.abs(rounded - clean) <= 1e-9 ? clean : rounded;

/** Граммы позиции: KG/L → ×1000; PCS/PACK → qty × pieceWeightG (эталон Java weightOfGrams). */
function mockWeightGrams(qty: number, unit?: string, pieceWeightG?: number | null): number {
  if (unit === 'KG' || unit === 'L') return qty * 1000;
  if (pieceWeightG != null && pieceWeightG > 0) return qty * pieceWeightG;
  return 0;
}

/** Ккал позиции: kcalPer100g × граммы / 100 (эталон Java kcalOf). */
function mockKcalOf(qty: number, unit?: string, kcalPer100g?: number | null, pieceWeightG?: number | null): number {
  if (kcalPer100g == null) return 0;
  return (mockWeightGrams(qty, unit, pieceWeightG) * kcalPer100g) / 100;
}

export const mockServer = {
  handleRequest<T>(method: string, path: string, body?: any): T {
    // Отрезаем query string для матчинга маршрута
    const pathWithoutQuery = path.split('?')[0];
    
    // Маршрутизация
    if (pathWithoutQuery.startsWith('/auth/')) {
      return this.handleAuth(method, path, body) as T;
    }
    if (pathWithoutQuery.startsWith('/product-categories')) {
      return this.handleCategories(method, path) as T;
    }
    // CONTRACT-P1 (PLAN.md Backlog п.1): алиас /admin/ingredients ≡ /admin/products
    // (реальные потребители BindingWizard/SubstitutionModal ходят на ingredients)
    if (
      pathWithoutQuery.startsWith('/admin/products') ||
      pathWithoutQuery.startsWith('/admin/ingredients')
    ) {
      return this.handleProducts(method, path, body) as T;
    }
    // CONTRACT-P1: синхронизация интеграций (SYNC_ALREADY_RUNNING)
    if (pathWithoutQuery.startsWith('/integrations/')) {
      return this.handleIntegrations(method, pathWithoutQuery) as T;
    }
    // ЗАДАЧА 2 (SyncLogsPage на api-клиент): mock-роуты журнала синков и OFF sync/prices
    if (pathWithoutQuery === '/admin/sync-logs/kpi' && method === 'GET') {
      return { totalRuns: 0, successRate: 0, totalUpdated: 0, totalErrors: 0 } as T;
    }
    if (pathWithoutQuery === '/admin/sync-logs' && method === 'GET') {
      return [] as T;
    }
    if (pathWithoutQuery === '/admin/integrations/OFF/sync/prices' && method === 'POST') {
      if (syncRunning) {
        throw {
          status: 409,
          message: 'SYNC_ALREADY_RUNNING',
          detail: 'A synchronization is already in progress',
        } as any;
      }
      syncRunning = true;
      // Как в handleIntegrations: синк «происходит» асинхронно и освобождает флаг,
      // иначе последующие sync-запросы вечно получают 409.
      setTimeout(() => { syncRunning = false; }, 1500);
      return { status: 'RUNNING', startedAt: new Date().toISOString() } as T;
    }
    // CONTRACT-P1: CRUD рецептов админа живёт в handleRecipes (POST/PUT/DELETE /admin/recipes)
    if (pathWithoutQuery.startsWith('/admin/recipes')) {
      return this.handleRecipes(method, pathWithoutQuery, body) as T;
    }
    if (pathWithoutQuery.startsWith('/recipes')) {
      return this.handleRecipes(method, path, body) as T;
    }
    // P0-3: чтение цен — GET /prices ≡ POST /admin/ingredient-prices (реальный путь бэкенда).
    // (E2E-05: TripDetailPage/AdminPage/PriceOverridesTab грузили список цен и ловили 404)
    if (pathWithoutQuery === '/prices' && method === 'GET') {
      // V20: справочник цен — только глобальные продукты; цены похода — /trips/:id/prices.
      // Паритет с UserPriceController: последний действующий срез на каждый продукт.
      return this.latestPerIngredient(prices.filter(pr => {
        const p = products.find(x => x.id === pr.ingredientId);
        return p && !(p as any).tripId;
      })) as T;
    }
    // Обратная совместимость со старыми тестами/кодом на /admin/prices (только чтение)
    if (pathWithoutQuery === '/admin/prices' && method === 'GET') {
      return this.latestPerIngredient([...prices]) as T;
    }
    // P0-3: POST /admin/ingredient-prices (плоский путь реального бэкенда) —
    // эквивалентен legacy POST /admin/products/:id/prices, контракт DUPLICATE_PRICE_DATE тот же.
    if (pathWithoutQuery.startsWith('/admin/ingredient-prices') && method === 'POST') {
      const dup = prices.find(
        pr => String(pr.ingredientId) === String(body.ingredientId) && pr.effectiveFrom === body.effectiveFrom
      );
      if (dup) {
        throw {
          status: 409,
          message: 'DUPLICATE_PRICE_DATE',
          detail: `Price for ${body.effectiveFrom} already exists`,
        } as any;
      }
      const entry: IngredientPrice = {
        id: `p_${Date.now()}`,
        ingredientId: String(body.ingredientId),
        pricePerUnit: body.pricePerUnit,
        currency: body.currency || 'RUB',
        effectiveFrom: body.effectiveFrom,
      };
      prices.push(entry);
      return entry as T;
    }
    if (pathWithoutQuery.startsWith('/trips')) {
      return this.handleTrips(method, path, body) as T;
    }
    if (pathWithoutQuery === '/meta') {
      return { version: '1.0.0', build: new Date().toISOString(), db: 'mock', application: 'provision' } as T;
    }

    throw { status: 404, message: 'Not found', detail: `Route ${path} not implemented in mock` };
  },

  // Категории
  handleCategories(method: string, _path: string): any {
    if (method === 'GET') {
      return categories.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    throw { status: 405, message: 'Method not allowed' };
  },

  // CONTRACT-P1 (PLAN.md Backlog п.1): синхронизация интеграций — SYNC_ALREADY_RUNNING
  handleIntegrations(method: string, pathWithoutQuery: string): any {
    if (pathWithoutQuery.endsWith('/sync') && method === 'POST') {
      if (syncRunning) {
        throw {
          status: 409,
          message: 'SYNC_ALREADY_RUNNING',
          detail: 'A synchronization is already in progress',
        } as any;
      }
      syncRunning = true;
      return { status: 'RUNNING', startedAt: new Date().toISOString() };
    }
    // GET .../sync/status — позволяет завершить running-состояние в тестах/UI
    if (pathWithoutQuery.endsWith('/sync/status') && method === 'GET') {
      return { running: syncRunning };
    }
    if (pathWithoutQuery.endsWith('/sync/finish') && method === 'POST') {
      syncRunning = false;
      return { status: 'DONE', finishedAt: new Date().toISOString() };
    }
    throw { status: 404, message: 'Not found', detail: `Route ${pathWithoutQuery} not implemented in mock` };
  },

  // Продукты (алиас routes: /admin/products ≡ /admin/ingredients — CONTRACT-P1)
  handleProducts(method: string, path: string, body?: any): any {
    // Проверяем fail из query string
    const url = new URL(`http://localhost${path}`);
    const failMode = url.searchParams.get('fail');
    if (failMode === 'products') {
      throw { status: 500, message: 'Mock server error' } as any;
    }

    const parts = path.split('?')[0].split('/').filter(Boolean);
    const collectionIdx = parts[0] === 'admin' ? 1 : 0;
    const isCollection = parts[collectionIdx] === 'products' || parts[collectionIdx] === 'ingredients';
    const idSegment = isCollection ? parts[collectionIdx + 1] : parts[collectionIdx];
    const subResource = isCollection ? parts[collectionIdx + 2] : parts[collectionIdx + 1];

    // GET .../check-name
    if (idSegment === 'check-name') {
      const name = url.searchParams.get('name') || '';
      const unit = url.searchParams.get('unit') || '';

      const normalizedName = normalize(name);
      const existing = products.find(p =>
        !(p as any).tripId && normalize(p.name) === normalizedName && p.unit === unit
      );

      if (existing) {
        return { duplicate: true, existingId: existing.id, existingName: existing.name, sameUnit: true };
      }

      const softDuplicate = products.find(p => !(p as any).tripId && normalize(p.name) === normalizedName && p.unit !== unit);
      if (softDuplicate) {
        return { duplicate: true, existingId: softDuplicate.id, existingName: softDuplicate.name, sameUnit: false };
      }

      return { duplicate: false };
    }

    // POST .../:id/prices — CONTRACT-P1: DUPLICATE_PRICE_DATE
    if (method === 'POST' && subResource === 'prices' && idSegment) {
      const ingredient = products.find(p => p.id === idSegment);
      if (!ingredient) {
        throw { status: 404, message: 'Not found', detail: `Product ${idSegment} not found` } as any;
      }
      const dup = prices.find(
        pr => pr.ingredientId === idSegment && pr.effectiveFrom === body.effectiveFrom
      );
      if (dup) {
        throw {
          status: 409,
          message: 'DUPLICATE_PRICE_DATE',
          detail: `Price for ${body.effectiveFrom} already exists`,
        } as any;
      }
      const entry: IngredientPrice = {
        id: `p_${Date.now()}`,
        ingredientId: idSegment,
        pricePerUnit: body.pricePerUnit,
        currency: body.currency || 'RUB',
        effectiveFrom: body.effectiveFrom,
      };
      prices.push(entry);
      return entry;
    }

    // GET коллекции — CONTRACT-P1: единая форма PageResponse (как backend PageResponse.of)
    if (method === 'GET' && isCollection && !idSegment) {
      const page = Number(url.searchParams.get('page') ?? 0);
      const size = Number(url.searchParams.get('size') ?? 100);
      const content = products.filter(p => !(p as any).tripId).map(p => ({
        ...p,
        unitLabel: UNIT_LABELS[p.unit] || p.unit,
        categoryName: p.category,
        usageRecipes: recipes.filter(r => r.ingredients.some(i => i.ingredientId === p.id)).length,
        bindingStatus: p.code ? 'BOUND' : 'UNBOUND'
      }));
      const totalElements = content.length;
      const totalPages = size > 0 ? Math.ceil(totalElements / size) : 0;
      const safePage = Math.max(0, Math.min(page, Math.max(totalPages - 1, 0)));
      const slice = size > 0 ? content.slice(safePage * size, safePage * size + size) : [];
      return {
        content: slice,
        page: safePage,
        size,
        totalElements,
        totalPages,
        first: safePage === 0,
        last: totalPages === 0 || safePage === totalPages - 1,
      };
    }

    // POST коллекции — создание продукта
    if (method === 'POST' && isCollection && !idSegment) {
      const nameNorm = normalize(body.name);
      const duplicate = products.find(p => !(p as any).tripId && normalize(p.name) === nameNorm && p.unit === body.unit);

      if (duplicate) {
        throw { status: 409, message: 'DUPLICATE_PRODUCT', detail: 'Product with this name and unit already exists' } as any;
      }

      // CR-1: валидация piece_weight_g для PCS/PACK
      if ((body.unit === 'PCS' || body.unit === 'PACK') && body.kcalPer100g && !body.pieceWeightG) {
        throw { status: 400, message: 'VALIDATION_ERROR', detail: 'pieceWeightG is required for PCS/PACK when kcalPer100g is set' } as any;
      }

      const newProduct: Ingredient = {
        id: `ing_${Date.now()}`,
        name: body.name,
        unit: body.unit,
        unitLabel: UNIT_LABELS[body.unit],
        category: categories.find(c => c.id === body.categoryId)?.name || 'Прочее',
        categoryId: body.categoryId,
        packSize: body.packSize,
        roundToPacks: body.roundToPacks,
        kcalPer100g: body.kcalPer100g,
        pieceWeightG: body.pieceWeightG,
        createdAt: new Date().toISOString()
      };

      products.push(newProduct);
      return newProduct;
    }

    // PUT /:id
    if (method === 'PUT' && idSegment) {
      const index = products.findIndex(p => p.id === idSegment);

      if (index === -1) {
        throw { status: 404, message: 'Not found' } as any;
      }

      // CONTRACT-P1: переименование/смена unit занятого продукта -> PRODUCT_IN_USE
      const renaming =
        (body.name !== undefined && normalize(body.name) !== normalize(products[index].name)) ||
        (body.unit !== undefined && body.unit !== products[index].unit);
      if (renaming) {
        const usedIn = findUsedIn(idSegment);
        if (usedIn.length > 0) {
          throw {
            status: 409,
            message: 'PRODUCT_IN_USE',
            detail: 'Product is referenced by recipes/trips',
            usedIn,
          } as any;
        }
      }

      products[index] = {
        ...products[index],
        name: body.name,
        unit: body.unit,
        unitLabel: UNIT_LABELS[body.unit],
        category: categories.find(c => c.id === body.categoryId)?.name || products[index].category,
        packSize: body.packSize,
        roundToPacks: body.roundToPacks,
        kcalPer100g: body.kcalPer100g,
        pieceWeightG: body.pieceWeightG
      };

      return products[index];
    }

    // DELETE /:id — CONTRACT-P1: PRODUCT_IN_USE (+usedIn)
    if (method === 'DELETE' && idSegment) {
      const index = products.findIndex(p => p.id === idSegment);

      if (index === -1) {
        throw { status: 404, message: 'Not found' } as any;
      }

      const usedIn = findUsedIn(idSegment);
      if (usedIn.length > 0) {
        throw {
          status: 409,
          message: 'PRODUCT_IN_USE',
          detail: 'Product is referenced by recipes/trips',
          usedIn,
        } as any;
      }

      products.splice(index, 1);
      return null;
    }

    throw { status: 404, message: 'Not found' } as any;
  },

  // Рецепты
  handleRecipes(method: string, path: string, body?: any): any {
    const url = new URL(`http://localhost${path}`);
    // GET /recipes?search=... — серверный поиск по названию блюда и продуктам
    // (используется поиском блюд в модалке «Добавить приём пищи»).
    if (method === 'GET' && url.searchParams.get('search')) {
      const q = normalize(url.searchParams.get('search')!);
      // V20: каталог — только глобальные рецепты
      const hit = (r: Recipe) =>
        normalize(r.name).includes(q) ||
        r.ingredients.some(ri => {
          const ing = products.find(p => p.id === ri.ingredientId) ?? ri.ingredient;
          return ing ? normalize(ing.name).includes(q) : false;
        });
      return recipes.filter(r => !(r as any).tripId).filter(hit).map(r => this.recipeToResponse(r));
    }

    // PUT /admin/recipes/:id — правка состава блюда прямо из окна добавления
    // приёма пищи (замена/добавление продукта). В mock роль не проверяем.
    if (method === 'PUT' && url.pathname.startsWith('/admin/recipes/')) {
      const id = url.pathname.split('/')[3];
      const idx = recipes.findIndex(r => r.id === id);
      if (idx === -1) {
        throw { status: 404, message: 'Not found', detail: `Recipe ${id} not found` } as any;
      }
      const items = Array.isArray(body?.ingredients) ? body.ingredients : null;
      if (!items || items.length === 0) {
        throw { status: 400, message: 'Bad request', detail: 'ingredients is required' } as any;
      }
      for (const it of items) {
        if (!products.some(p => p.id === String(it.ingredientId))) {
          throw { status: 400, message: 'VALIDATION_ERROR', detail: `Ingredient ${it.ingredientId} not found` } as any;
        }
      }
      recipes[idx] = {
        ...recipes[idx],
        name: body.name ?? recipes[idx].name,
        mealType: body.mealType ?? recipes[idx].mealType,
        baseServings: body.baseServings ?? recipes[idx].baseServings,
        ingredients: items.map((it: any) => ({
          ingredientId: String(it.ingredientId),
          amount: Number(it.amount),
        })),
      };
      return this.recipeToResponse(recipes[idx]);
    }

    // CONTRACT-P1: POST /admin/recipes — создание блюда (паритет валидации с бэкендом:
    // 400 c errors[] по полям RecipeRequest)
    if (method === 'POST' && url.pathname === '/admin/recipes') {
      const errs: Array<{ field: string; message: string }> = [];
      if (!body || typeof body.name !== 'string' || !body.name.trim()) {
        errs.push({ field: 'name', message: 'must not be blank' });
      }
      if (!['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'].includes(body?.mealType)) {
        errs.push({ field: 'mealType', message: 'must be one of BREAKFAST, LUNCH, DINNER, SNACK' });
      }
      if (!body?.baseServings || body.baseServings < 1) {
        errs.push({ field: 'baseServings', message: 'must be >= 1' });
      }
      const items = Array.isArray(body?.ingredients) ? body.ingredients : [];
      if (items.length === 0) {
        errs.push({ field: 'ingredients', message: 'must contain at least one ingredient' });
      }
      for (const it of items) {
        if (!products.some(p => p.id === String(it?.ingredientId))) {
          errs.push({ field: 'ingredients', message: `ingredient ${it?.ingredientId} not found` });
        }
        if (!(Number(it?.amount) > 0)) {
          errs.push({ field: 'ingredients', message: 'amount must be > 0' });
        }
      }
      if (errs.length > 0) {
        throw { status: 400, title: 'Validation Failed', detail: 'Recipe payload is invalid', errors: errs } as any;
      }
      const rec: any = {
        id: `rec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: String(body.name).trim(),
        mealType: body.mealType,
        category: body.category ?? undefined,
        cookMinutes: body.cookMinutes ?? 0,
        baseServings: body.baseServings,
        caloriesPerServing: body.caloriesPerServing ?? undefined,
        source: 'MANUAL',
        ingredients: items.map((it: any) => ({
          ingredientId: String(it.ingredientId),
          amount: Number(it.amount),
        })),
      };
      recipes.push(rec);
      return this.recipeToResponse(rec);
    }

    // CONTRACT-P1: DELETE /admin/recipes/:id — 404 на неизвестный, 409 RECIPE_IN_USE
    // с usedIn, если рецепт занят приёмами пищи походов (как бэкенд)
    if (method === 'DELETE' && url.pathname.startsWith('/admin/recipes/')) {
      const id = url.pathname.split('/')[3];
      const idx = recipes.findIndex(r => r.id === id);
      if (idx === -1) throw { status: 404, message: 'Not found', detail: `Recipe ${id} not found` } as any;
      const usedBy = trips.filter(t =>
        (t as any).days?.some((d: any) => d.meals?.some((m: any) => String(m.recipeId) === String(id)))
      );
      if (usedBy.length > 0) {
        throw {
          status: 409,
          title: 'Conflict',
          detail: 'Recipe is used in trip meals and cannot be deleted',
          usedIn: usedBy.map(t => ({ resourceType: 'TRIP', resourceId: t.id, resourceName: t.name })),
        } as any;
      }
      recipes.splice(idx, 1);
      return null;
    }

    if (method === 'GET') {
      return recipes.filter(r => !(r as any).tripId).map(r => this.recipeToResponse(r));
    }

    throw { status: 405, message: 'Method not allowed' };
  },

  /** Приводит рецепт из in-memory хранилища к форме ответа GET /recipes. */
  recipeToResponse(r: Recipe): any {
        const ingredients = r.ingredients.map(ri => {
          const ing = products.find(p => p.id === ri.ingredientId);
          return {
            ...ri,
            ingredient: ing,
            unitLabel: ing ? UNIT_LABELS[ing.unit] : ri.ingredient?.unit
          };
        });

        // CR-1: расчёт калорийности из продуктов
        const kcalResult = calculateRecipeKcal(
          ingredients.map(i => ({
            amount: i.amount,
            unit: i.ingredient?.unit || 'KG',
            kcalPer100g: i.ingredient?.kcalPer100g,
            pieceWeightG: i.ingredient?.pieceWeightG,
            name: i.ingredient?.name || ''
          })),
          r.baseServings
        );

        return {
          ...r,
          ingredients,
          calculatedCaloriesPerServing: kcalResult.caloriesPerServing,
          missingKcalIngredients: kcalResult.missingKcalIngredients
        };
  },

  // Походы
  // V20 (mock-паритет): copy-on-write снепшоты каталога для похода.
  // Идентификаторы копий детерминированные: `${origId}::t${tripId}` — findOrCreate идемпотентен.
  latestPerIngredient(rows: any[]): any[] {
    const latest = new Map<string, any>();
    for (const pr of rows) {
      const cur = latest.get(pr.ingredientId);
      if (!cur || pr.effectiveFrom >= cur.effectiveFrom) latest.set(pr.ingredientId, pr);
    }
    return [...latest.values()];
  },

  snapProductForTrip(tripId: string, p: any): any {
    const id = `${p.id}::t${tripId}`;
    let copy: any = products.find(x => x.id === id);
    if (!copy) {
      copy = { ...p, id, tripId, snapshotOf: p.id, code: null };
      products.push(copy);
      const latest = prices
        .filter(pr => pr.ingredientId === p.id)
        .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
      if (latest) {
        prices.push({ ...latest, id: `pr_${id}`, ingredientId: id });
      }
    }
    return copy;
  },

  snapRecipeForTrip(tripId: string, r: any): any {
    const id = `${r.id}::t${tripId}`;
    let copy: any = recipes.find(x => x.id === id);
    if (!copy) {
      copy = {
        ...r,
        id,
        tripId,
        snapshotOf: r.id,
        ingredients: (r.ingredients || []).map((ri: any) => {
          const gp = products.find(p => p.id === ri.ingredientId);
          const sp = gp ? this.snapProductForTrip(tripId, gp) : null;
          return { ingredientId: sp ? sp.id : ri.ingredientId, amount: ri.amount };
        }),
      };
      recipes.push(copy);
    }
    return copy;
  },

  /**
   * FORM-meal-composition-spec §4.2/§4.4: GET/PUT /trips/:t/meals/:m/composition.
   * In-memory правки (substitutions-хранилище) трактуются ровно как на бэкенде
   * (MealCompositionService): SCALE = from===to, EXTRA = added (абсолют на приём,
   * хранится per-serving), EXCLUDE = removed/to=null, SUBST = from→to × ratio.
   */
  handleMealComposition(method: string, tripId: string, mealId: string, body?: any): any {
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

    if (method === 'PUT') this.applyCompositionPut(tripId, day, meal, recipe, body);
    return this.buildCompositionResponse(trip, day, meal, recipe);
  },

  /** Атомарный диф-коммит желаемого состояния (паритет с MealCompositionService.putComposition). */
  applyCompositionPut(tripId: string, day: any, meal: any, recipe: any, body: any): void {
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
    // Область PUT — правки текущего приёма (mealId на записи; паритет с бэкендом,
    // где composition хранит editSet per-meal) + legacy-правки без mealId. Иначе
    // batch-PUT одного приёма снимал бы EXTRA/SCALE-правки других приёмов того же
    // рецепта (тест 2b: гречка m3 теряла SCALED×1.5 при PUT нового приёма).
    const ownEdit = (s: MockSubstitution) => s.mealId == null || String(s.mealId) === String(meal.id);
    const editsOf = () => allTripEdits(tripId).filter(s => editRecipeKey(s.recipeId) === recipeId && ownEdit(s));
    // Все composition-правки этого рецепта (включая другие приёмы) — для проверки
    // «уже есть замена» перед созданием дубликата (уникальность from в рамках рецепта).
    const recipeEdits = () => allTripEdits(tripId).filter(s => editRecipeKey(s.recipeId) === recipeId);
    const removeEdit = (s: MockSubstitution) => {
      substitutions[tripId] = (substitutions[tripId] || []).filter(x => x.id !== s.id);
      removedItems[tripId] = (removedItems[tripId] || []).filter(x => x.id !== s.id);
    };

    // people для EXTRA-конверсии — та же формула, что в buildCompositionResponse
    const tripObj = trips.find(t => t.id === tripId);
    const people = meal.peopleOverride ?? day?.peopleOverride ?? tripObj?.defaultPeople ?? 1;
    const keepScaled = new Set<string>();
    const keepExtra = new Set<string>();
    const keepExcluded = new Set<string>();

    for (const it of items) {
      const ingId = String(it.ingredientId);
      const st = String(it.state);
      if (st === 'SCALED') {
        keepScaled.add(editIngredientKey(ingId));
        const ingKey = editIngredientKey(ingId); // правки храним под каталожным id (composition-расчёты идут по базовому рецепту)
        const ex = editsOf().find(s => !s.added && s.fromIngredientId != null && s.toIngredientId == null && editIngredientKey(s.fromIngredientId) === ingKey);
        if (ex) removeEdit(ex); // SCALED поверх EXCLUDED снимает исключение
        const existing = editsOf().find(s => s.fromIngredientId != null && editIngredientKey(s.fromIngredientId) === ingKey && editIngredientKey(s.toIngredientId) === ingKey);
        if (existing) existing.ratio = Number(it.ratio);
        else list.push({
          id: `sub-${substitutionSeq++}`, recipeId, fromIngredientId: ingKey, toIngredientId: ingKey,
          amountPerServing: 0, ratio: Number(it.ratio), added: false, removed: false, scale: true,
          mealId: String(meal.id), comment: 'SCALE via composition',
        });
      } else if (st === 'EXTRA') {
        keepExtra.add(editIngredientKey(ingId));
        // §3: EXTRA — абсолют на приём. Храним его напрямую (absoluteAmount) +
        // per-serving-фолбэк для конвейера закупки; прямой absolute round-trip
        // без дрейфа округления при смене people (0,25 → 0,25, а не 0,25/6×6=0,252).
        const abs = Number(it.amount);
        const perServing = r3(abs / people);
        // Целевой id правки — КАТАЛОЖНЫЙ ингредиент ('ing8'), а не trip-scoped снепшот
        // ('ing8::ttrip1'): composition резолвит расчёты по базовому рецепту (паритет с бэкендом).
        const targetId = editIngredientKey(ingId);
        const existing = editsOf().find(s => (s.added || s.fromIngredientId == null) && String(s.toIngredientId) === targetId);
        if (existing) { existing.absoluteAmount = abs; existing.amountPerServing = perServing; }
        else list.push({
          id: `sub-${substitutionSeq++}`, recipeId, fromIngredientId: null, toIngredientId: targetId,
          amountPerServing: perServing, absoluteAmount: abs, ratio: 1, added: true, removed: false,
          mealId: String(meal.id), comment: 'EXTRA via composition',
        });
      } else if (st === 'EXCLUDED') {
        keepExcluded.add(editIngredientKey(ingId));
        const ingKey = editIngredientKey(ingId);
        const has = editsOf().some(s => s.removed || (s.fromIngredientId != null && s.toIngredientId == null && editIngredientKey(s.fromIngredientId) === ingKey));
        if (!has) {
          const created: MockSubstitution = {
            id: `rmv-${removedSeq++}`, recipeId, fromIngredientId: ingKey, toIngredientId: null,
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
    // Замены: полная замена набора from→to
    for (const s of editsOf()) {
      if (s.fromIngredientId != null && s.toIngredientId != null && String(s.fromIngredientId) !== String(s.toIngredientId)) {
        removeEdit(s);
      }
    }
    for (const dto of subs) {
      // Одна активная замена на from-ингредиент: снимаем предыдущую (паритет с putComposition)
      const fromKey = editIngredientKey(String(dto.fromIngredientId));
      const stale = editsOf().find(s =>
        !s.added && !s.removed && s.fromIngredientId != null && s.toIngredientId != null &&
        String(s.fromIngredientId) !== String(s.toIngredientId) &&
        editIngredientKey(s.fromIngredientId) === fromKey &&
        editRecipeKey(s.recipeId) === recipeId);
      if (stale) removeEdit(stale);
      list.push({
        id: `sub-${substitutionSeq++}`, recipeId,
        fromIngredientId: editIngredientKey(String(dto.fromIngredientId)), toIngredientId: editIngredientKey(String(dto.toIngredientId)),
        amountPerServing: 0, ratio: Number(dto.ratio ?? 1) || 1, added: false, removed: false,
        mealId: String(meal.id), comment: 'SUBST via composition',
      });
    }
  },

  /** Сборка ответа composition — тот же порядок, что §3 и buildResponse на Java. */
  buildCompositionResponse(trip: any, day: any, meal: any, recipe: any): any {
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
      baseServings, recipeId: recipe.id, recipeName: recipe.name,
      items, substitutions: subDtos,
      totals: { kcal: r3(kcal), weightGrams: r3(weightGrams), plannedCost: r2(plannedCost) },
    };
  },

  handleTrips(method: string, path: string, body?: any): any {
    const parts = path.split('/').filter(Boolean);

    // V20: цены похода — по trip-scoped копиям продуктов; если снепшотов нет
    // (legacy/сид-походы) — фолбэк на глобальный срез, как TripPriceController
    if (method === 'GET' && parts.length === 3 && parts[2] === 'prices') {
      const tripId = parts[1];
      if (!trips.find(t => t.id === tripId)) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` } as any;
      }
      const snapIds = new Set(products.filter(p => (p as any).tripId === tripId).map(p => p.id));
      const rows = snapIds.size === 0
        ? prices.filter(pr => products.find(p => p.id === pr.ingredientId && !(p as any).tripId))
        : prices.filter(pr => snapIds.has(pr.ingredientId));
      const latestByIng = new Map<string, any>();
      for (const pr of rows) {
        const cur = latestByIng.get(pr.ingredientId);
        if (!cur || pr.effectiveFrom >= cur.effectiveFrom) latestByIng.set(pr.ingredientId, pr);
      }
      return [...latestByIng.values()];
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
        const snap = globalRecipe ? this.snapRecipeForTrip(tripId, globalRecipe) : recipes.find(r => r.id === body.recipeId);
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
      return this.handleMealComposition(method, parts[1], parts[3], body) as any;
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
            const comp = this.buildCompositionResponse(trip, d, m, rec);
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
    
    // GET /trips
    if (parts.length === 1 && method === 'GET') {
      return trips;
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
        .map(r => this.recipeToResponse(r));
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
    // GET /trips/:id/substitutions
    if (parts.length === 3 && parts[2] === 'substitutions' && method === 'GET') {
      const tripId = parts[1];
      if (!trips.find(t => t.id === tripId)) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      return [
        ...(substitutions[tripId] || []),
        ...(removedItems[tripId] || []),
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
          id: `rmv-${removedSeq++}`,
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
        id: `sub-${substitutionSeq++}`,
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

    // PUT /trips/:id/shopping-exclusions — список ingredientId, исключаемых из расчёта
    if (parts.length === 3 && parts[2] === 'shopping-exclusions' && method === 'PUT') {
      const tripId = parts[1];
      if (!trips.find(t => t.id === tripId)) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      if (!Array.isArray(body?.ingredientIds)) {
        throw { status: 400, message: 'Bad request', detail: 'Expected { ingredientIds: string[] }' };
      }
      shoppingExcluded[tripId] = body.ingredientIds.map(String);
      return shoppingExcluded[tripId];
    }

    // GET /trips/:id/shopping-exclusions
    if (parts.length === 3 && parts[2] === 'shopping-exclusions' && method === 'GET') {
      const tripId = parts[1];
      if (!trips.find(t => t.id === tripId)) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      return shoppingExcluded[tripId] || [];
    }

    // DELETE /trips/:id/shopping-exclusions/:ingredientId
    if (parts.length === 4 && parts[2] === 'shopping-exclusions' && method === 'DELETE') {
      const tripId = parts[1];
      if (!trips.find(t => t.id === tripId)) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      shoppingExcluded[tripId] = (shoppingExcluded[tripId] || []).filter(x => x !== String(parts[3]));
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
        id: `rmv-${removedSeq++}`,
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
      const shoppingData = this.handleTrips('GET', `/trips/${tripId}/summary/shopping`, null);
      
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
      return Object.entries(overrides).map(([ingredientId, data]) => ({
        ingredientId,
        ...data
      }));
    }

    // POST /trips — создание похода (E2E-04/05: раньше роут отсутствовал,
    // TripsPage получал 405 и поход не появлялся в списке)
    if (parts.length === 1 && method === 'POST') {
      const newTrip: Trip = {
        id: `trip-${Date.now()}`,
        userId: body?.userId ?? users[0].id,
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
  },

  // Авторизация
  handleAuth(method: string, path: string, body?: any): any {
    if (path === '/auth/register' && method === 'POST') {
      const { email, password, firstName, lastName } = body;
      
      // Проверка существования пользователя
      if (users.find(u => u.email === email)) {
        throw { status: 409, message: 'Conflict', detail: 'Email already registered' };
      }
      
      // Создание нового пользователя
      const newUser: MockUser = {
        id: String(users.length + 1),
        email,
        password,
        firstName,
        lastName,
        role: 'USER',
        createdAt: new Date().toISOString()
      };
      users.push(newUser);

      // Расширение контракта (P1, AUTH-01): register сразу выдаёт пару токенов +
      // поля пользователя — форма ответа идентична бэкенду (AuthService.AuthResponseWithUser).
      return {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        accessToken: `mock-access-token-${newUser.id}`,
        refreshToken: `mock-refresh-token-${newUser.id}`,
        tokenType: 'Bearer'
      };
    }
    
    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = body;
      const user = users.find(u => u.email === email && u.password === password);
      
      if (!user) {
        throw { status: 401, message: 'Unauthorized', detail: 'Invalid email or password' };
      }
      
      return {
        accessToken: `mock-access-token-${user.id}`,
        refreshToken: `mock-refresh-token-${user.id}`,
        tokenType: 'Bearer'
      };
    }
    
    if (path === '/auth/me' && method === 'GET') {
      // E2E: токен несёт id пользователя ('mock-access-token-<id>') — по нему
      // возвращаем конкретного юзера, чтобы TripsPage фильтровал myTrips корректно.
      const token = localStorage.getItem('accessToken') || '';
      const m = token.match(/mock-access-token-(\d+)$/);
      const user = (m && users.find(u => u.id === m[1])) || users[0];
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      };
    }
    
    if (path === '/auth/logout' && method === 'POST') {
      return null;
    }
    
    throw { status: 404, message: 'Not found', detail: `Auth route ${path} not implemented` };
  }
};
