/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * каталог: категории, продукты (admin/products|ingredients), рецепты (admin/recipes|recipes).
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import type { Ingredient, Recipe, IngredientPrice } from '../types';
import { calculateRecipeKcal } from '../utils/calc';
import { products, categories, recipes, trips, prices, normalize, UNIT_LABELS } from './mockState';
import { emisByCode, priceSyncStatusOf } from './mockEmis';

// CONTRACT-P1 (PLAN.md Backlog п.1): где продукт занят — для PRODUCT_IN_USE.usedIn
export function findUsedIn(productId: string): { resourceType: string; resourceId: string; resourceName: string }[] {
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

  /**
   * Действующая цена продукта в форме ProductResponse.currentPrice.
   * Источник — ROSSTAT у привязанных к ЕМИСС (цену применила синхронизация),
   * MANUAL у остальных (цену ведёт человек).
   */

export function currentPriceOfImpl(p: Ingredient): { value: number; currency: string; effectiveFrom: string; source: string } | undefined {
  const own = prices
    .filter(pr => pr.ingredientId === p.id)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  if (!own) return undefined;
  return {
    value: own.pricePerUnit,
    currency: own.currency,
    effectiveFrom: own.effectiveFrom,
    source: p.emisCode ? 'ROSSTAT' : 'MANUAL',
  };
}

  // Категории

export function handleCategoriesImpl(method: string, _path: string): any {
  if (method === 'GET') {
    return categories.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  throw { status: 405, message: 'Method not allowed' };
}

  // Продукты (алиас routes: /admin/products ≡ /admin/ingredients — CONTRACT-P1)

export function handleProductsImpl(srv: any, method: string, path: string, body?: any): any {
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
      currentPrice: srv.currentPriceOf(p),
      emisCode: p.emisCode ?? null,
      emisName: emisByCode(p.emisCode)?.name ?? null,
      priceSyncStatus: priceSyncStatusOf(p.emisCode),
      // KB-8 (паритет с ProductService.emisSharedWithOthers): сколько ЕЩЁ глобальных
      // продуктов привязано к той же позиции ЕМИСС — значок «привязка уже используется».
      emisSharedCount: p.emisCode
        ? products.filter(o => !(o as any).tripId && o.id !== p.id && o.emisCode === p.emisCode).length
        : 0,
      // Привязка к ЕМИСС — «софт»: BOUND означает «источник цены выбран».
      bindingStatus: p.emisCode ? 'BOUND' : 'UNBOUND'
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

    // Паритет с ProductService.normalizeEmisCode: код обязан быть в локальном
    // справочнике, иначе продукт выглядел бы привязанным, а синк не находил бы цен.
    const emisCode = srv.normalizeEmisCode(body.emisCode);

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
      emisCode,
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
      pieceWeightG: body.pieceWeightG,
      // Пустая строка/null = отвязать (цену снова ведёт человек)
      emisCode: body.emisCode === undefined ? products[index].emisCode : srv.normalizeEmisCode(body.emisCode)
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
}

  // Рецепты

export function handleRecipesImpl(srv: any, method: string, path: string, body?: any): any {
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
    return recipes.filter(r => !(r as any).tripId).filter(hit).map(r => srv.recipeToResponse(r));
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
    return srv.recipeToResponse(recipes[idx]);
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
    return srv.recipeToResponse(rec);
  }

  // U16 (список багов 25.10) + паритет V20: блюдо — сущность верхнего уровня.
  // Семантика бэкенда (ConflictIntegrationTest «409 RECIPE_IN_USE ушёл в историю»):
  // приём пищи держит trip-scoped копию, удаление глобального блюда всегда 204,
  // поход продолжает считаться из копии. В mock-сиде походы ссылаются на глобальные
  // id напрямую (legacy) — при удалении переводим такие ссылки на снепшот-копии
  // (snapRecipeForTrip идемпотентен), вместо 409.
  if (method === 'DELETE' && url.pathname.startsWith('/admin/recipes/')) {
    const id = url.pathname.split('/')[3];
    const idx = recipes.findIndex(r => r.id === id);
    if (idx === -1) throw { status: 404, message: 'Not found', detail: `Recipe ${id} not found` } as any;
    const target = recipes[idx];
    for (const t of trips) {
      for (const d of (t as any).days || []) {
        for (const m of d.meals || []) {
          if (String(m.recipeId) === String(id)) {
            m.recipeId = srv.snapRecipeForTrip(t.id, target).id;
          }
        }
      }
    }
    recipes.splice(idx, 1);
    return null;
  }

  if (method === 'GET') {
    return recipes.filter(r => !(r as any).tripId).map(r => srv.recipeToResponse(r));
  }

  throw { status: 405, message: 'Method not allowed' };
}

  /** Приводит рецепт из in-memory хранилища к форме ответа GET /recipes. */

export function recipeToResponseImpl(r: Recipe): any {
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
}
