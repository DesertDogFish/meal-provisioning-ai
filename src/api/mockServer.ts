/**
 * CR-5: Mock-сервер для прототипа
 * Эмулирует API бэкенда с in-memory базой данных
 */

import { mockIngredients, mockRecipes, mockTrips, mockProductCategories, mockPrices } from '../data/mockData';
import { Ingredient, Recipe, Trip, ProductCategory, IngredientPrice } from '../types';
import { calculateRecipeKcal } from '../utils/calc';

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
  toIngredientId: string;          // 'to' при замене или сам продукт при добавлении
  amountPerServing: number;        // количество на порцию (для расчёта закупки)
  ratio: number;
  added: boolean;
  comment?: string;
}
const substitutions: Record<string, MockSubstitution[]> = {};
let substitutionSeq = 1;

/** Фаза 13 (п.6): мягкое удаление позиции «в рамках похода» — то же замещение,
 * но с to=null (продукт убирается из расчёта, рецепт в каталоге не меняется). */
interface MockRemoved extends Omit<MockSubstitution, 'toIngredientId'> {}
const removedItems: Record<string, MockRemoved[]> = {};
let removedSeq = 1;

/** Все пер-походные правки состава (замещения + удаления) одним списком. */
function allTripEdits(tripId: string): Array<MockSubstitution | MockRemoved> {
  return [...(substitutions[tripId] || []), ...(removedItems[tripId] || [])];
}

/** Применение пер-походных правок к строкам закупки: from→to × ratio,
 * ручные добавления (from=null), удаления (to=null → сумма не считается). */
function applyTripEditsToRows<T extends { ingredientId: string; catalogId?: string; totalAmount: number; plannedUnitPrice: number | null; actualUnitPrice: number | null; plannedCost: number | null; actualCost: number | null; overridden: boolean }>(
  tripId: string,
  rows: T[],
  scaleAmount: (amountPerServing: number) => number,
): T[] {
  const edits = allTripEdits(tripId);
  if (!edits.length) return rows;
  const idOf = (r: T) => String(r.catalogId ?? r.ingredientId);
  const out: T[] = rows.map(r => ({ ...r }));
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
        const p = dst.plannedUnitPrice;
        const a = dst.actualUnitPrice;
        out[dstIdx] = {
          ...dst,
          totalAmount: dst.totalAmount + amount,
          plannedCost: p != null ? p * (dst.totalAmount + amount) : dst.plannedCost,
          actualCost: a != null ? a * (dst.totalAmount + amount) : dst.actualCost,
        };
      } else {
        const product = products.find(pr => pr.id === String(e.toIngredientId));
        const p = product?.price ?? null;
        out.push({
          ...src,
          ingredientId: String(e.toIngredientId),
          catalogId: String(e.toIngredientId),
          ingredientName: product?.name ?? 'Замещённый продукт',
          unit: product?.unit ?? src.unit,
          totalAmount: amount,
          plannedUnitPrice: p,
          actualUnitPrice: ovFor(tripId, String(e.toIngredientId))?.actualPrice ?? p,
          plannedCost: p != null ? p * amount : null,
          actualCost: (ovFor(tripId, String(e.toIngredientId))?.actualPrice ?? p) != null
            ? ((ovFor(tripId, String(e.toIngredientId))?.actualPrice ?? p) as number) * amount
            : null,
          overridden: !!ovFor(tripId, String(e.toIngredientId)),
          hasPlannedPrice: p != null,
        } as unknown as T);
      }
    } else {
      // позиция добавлена руками (from=null либо 'from' отсутствует в базовых строках)
      if (out.some(r => idOf(r) === String(e.toIngredientId))) continue;
      const amount = scaleAmount(e.amountPerServing || 0);
      const product = products.find(pr => pr.id === String(e.toIngredientId));
      const p = product?.price ?? null;
      const o = ovFor(tripId, String(e.toIngredientId));
      out.push({
        ingredientId: String(e.toIngredientId),
        catalogId: String(e.toIngredientId),
        ingredientName: product?.name ?? 'Новый продукт',
        unit: product?.unit ?? 'KG',
        totalAmount: amount,
        plannedUnitPrice: p,
        actualUnitPrice: o?.actualPrice ?? p,
        plannedCost: p != null ? p * amount : null,
        actualCost: (o?.actualPrice ?? p) != null ? ((o?.actualPrice ?? p) as number) * amount : null,
        overridden: !!o,
        hasPlannedPrice: p != null,
      } as unknown as T);
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
    if (pathWithoutQuery.startsWith('/recipes')) {
      return this.handleRecipes(method, path, body) as T;
    }
    // P0-3: чтение цен — GET /prices ≡ POST /admin/ingredient-prices (реальный путь бэкенда).
    // (E2E-05: TripDetailPage/AdminPage/PriceOverridesTab грузили список цен и ловили 404)
    if (pathWithoutQuery === '/prices' && method === 'GET') {
      return [...prices] as T;
    }
    // Обратная совместимость со старыми тестами/кодом на /admin/prices (только чтение)
    if (pathWithoutQuery === '/admin/prices' && method === 'GET') {
      return [...prices] as T;
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
        normalize(p.name) === normalizedName && p.unit === unit
      );

      if (existing) {
        return { duplicate: true, existingId: existing.id, existingName: existing.name, sameUnit: true };
      }

      const softDuplicate = products.find(p => normalize(p.name) === normalizedName && p.unit !== unit);
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
      const content = products.map(p => ({
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
      const duplicate = products.find(p => normalize(p.name) === nameNorm && p.unit === body.unit);

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
      const hit = (r: Recipe) =>
        normalize(r.name).includes(q) ||
        r.ingredients.some(ri => {
          const ing = products.find(p => p.id === ri.ingredientId) ?? ri.ingredient;
          return ing ? normalize(ing.name).includes(q) : false;
        });
      return recipes.filter(hit).map(r => this.recipeToResponse(r));
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

    if (method === 'GET') {
      return recipes.map(r => this.recipeToResponse(r));
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
  handleTrips(method: string, path: string, body?: any): any {
    const parts = path.split('/').filter(Boolean);

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
        const meal = {
          id: `m-${Date.now()}`,
          tripDayId: dayId,
          mealType: body.mealType ?? 'LUNCH',
          recipeId: body.recipeId,
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

      const totalPlannedCost = items.reduce((sum, i) => sum + (i.plannedCost || 0), 0);
      const totalActualCost = items.reduce((sum, i) => sum + (i.actualCost || 0), 0);
      const deltaPercent = totalPlannedCost > 0 ? ((totalActualCost - totalPlannedCost) / totalPlannedCost) * 100 : null;

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
        ...(removedItems[tripId] || []).map(r => ({ ...r, toIngredientId: null })),
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
      if (fromId != null && list.some(s => s.recipeId === recipeId && String(s.fromIngredientId) === fromId)) {
        throw { status: 409, message: 'Conflict', detail: 'Substitution already exists for this ingredient in this recipe' };
      }
      const created: MockSubstitution = {
        id: `sub-${substitutionSeq++}`,
        recipeId,
        fromIngredientId: fromId,
        toIngredientId: toId as string,
        amountPerServing: Number(body?.amountPerServing ?? 0),
        ratio: Number(body?.ratio ?? 1) || 1,
        added: fromId == null,
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
      const before = (substitutions[tripId] || []).length;
      substitutions[tripId] = (substitutions[tripId] || []).filter(s => s.id !== parts[3]);
      return (substitutions[tripId]?.length ?? 0) === before ? null : { status: 'deleted' };
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
      const created: MockRemoved = {
        id: `rmv-${removedSeq++}`,
        recipeId,
        fromIngredientId: fromId,
        amountPerServing: Number(body?.amountPerServing ?? 0),
        ratio: 1,
        added: false,
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
          plannedCostPerDefaultPerson: shoppingData.totalPlannedCost / defaultPeople,
          actualCostPerDefaultPerson: shoppingData.totalActualCost / defaultPeople,
          plannedCostPerPersonMeal: shoppingData.totalPlannedCost / totalPersonMeals,
          actualCostPerPersonMeal: shoppingData.totalActualCost / totalPersonMeals,
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
