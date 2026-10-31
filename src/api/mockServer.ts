/**
 * CR-5: Mock-сервер для прототипа — фасад.
 * Эмулирует API бэкенда с in-memory базой данных.
 * Подзадача 25 аудита: обработчики ресурсов вынесены в модули mock* —
 * здесь остались роутер `handleRequest` и тонкие обёртки, сохраняющие
 * публичную поверхность объекта (тесты и ApiClient вызывают те же методы).
 */

import { normalizeEmisCodeImpl, tryEmisRoutes } from './mockEmis';
import { handleIntegrationsImpl, trySyncRoutes } from './mockSync';
import { tryStagingRoutes } from './mockStaging'; // cleanup-п.2: стагинг импорта каталога (R3 mock-паритет)
import { latestPerIngredientImpl, snapProductForTripImpl, snapRecipeForTripImpl } from './mockSnapshot';
import { tryPriceRoutes } from './mockPrices';
import { applyCompositionPutImpl, buildCompositionResponseImpl, handleMealCompositionImpl } from './mockComposition';
import { currentPriceOfImpl, handleCategoriesImpl, handleProductsImpl, handleRecipesImpl, recipeToResponseImpl } from './mockCatalog';
import { handleTripsImpl } from './mockTrips';
import { handleAuthImpl } from './mockAuth';
import type { Ingredient, Recipe } from '../types';
import {  } from './mockState';

export const mockServer = {
  /**
   * Нормализация кода привязки к ЕМИСС (паритет с ProductService.normalizeEmisCode):
   * пусто → null (отвязать), неизвестный код → 400 VALIDATION_ERROR.
   */
  normalizeEmisCode(raw: unknown): string | null {
    return normalizeEmisCodeImpl(raw);
  },
  /**
   * Действующая цена продукта в форме ProductResponse.currentPrice.
   * Источник — ROSSTAT у привязанных к ЕМИСС (цену применила синхронизация),
   * MANUAL у остальных (цену ведёт человек).
   */
  currentPriceOf(p: Ingredient): { value: number; currency: string; effectiveFrom: string; source: string } | undefined {
    return currentPriceOfImpl(p);
  },
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
    // Подзадача 25: синк-роуты (журнал, upload, sync/prices, connect/disconnect)
    // вынесены в mockSync.trySyncRoutes; каталог ЕМИСС — в mockEmis.tryEmisRoutes.
    // Ветки не пересекаются по путям, поэтому порядок групп не важен.
    const syncRoute = trySyncRoutes<T>(method, pathWithoutQuery, path, body);
    if (syncRoute.hit) return syncRoute.result;
    const emisRoute = tryEmisRoutes<T>(method, pathWithoutQuery, path);
    if (emisRoute.hit) return emisRoute.result;
    // cleanup-п.2: /admin/staging — «Импорт каталога» переехал из /admin в «Интеграции»
    const stagingRoute = tryStagingRoutes<T>(method, pathWithoutQuery, path, body);
    if (stagingRoute.hit) return stagingRoute.result;

    // CONTRACT-P1: CRUD рецептов админа живёт в handleRecipes (POST/PUT/DELETE /admin/recipes)
    if (pathWithoutQuery.startsWith('/admin/recipes')) {
      return this.handleRecipes(method, pathWithoutQuery, body) as T;
    }
    if (pathWithoutQuery.startsWith('/recipes')) {
      return this.handleRecipes(method, path, body) as T;
    }
    // Подзадача 25: ценовые ветки вынесены в mockPrices.tryPriceRoutes.
    const priceRoute = tryPriceRoutes<T>(mockServer, method, pathWithoutQuery, body);
    if (priceRoute.hit) return priceRoute.result;

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
    return handleCategoriesImpl(method, _path);
  },
  // CONTRACT-P1 (PLAN.md Backlog п.1): синхронизация интеграций — SYNC_ALREADY_RUNNING
  handleIntegrations(method: string, pathWithoutQuery: string): any {
    return handleIntegrationsImpl(method, pathWithoutQuery);
  },
  // Продукты (алиас routes: /admin/products ≡ /admin/ingredients — CONTRACT-P1)
  handleProducts(method: string, path: string, body?: any): any {
    return handleProductsImpl(mockServer, method, path, body);
  },
  // Рецепты
  handleRecipes(method: string, path: string, body?: any): any {
    return handleRecipesImpl(mockServer, method, path, body);
  },
  /** Приводит рецепт из in-memory хранилища к форме ответа GET /recipes. */
  recipeToResponse(r: Recipe): any {
    return recipeToResponseImpl(r);
  },
  // Походы
  // V20 (mock-паритет): copy-on-write снепшоты каталога для похода.
  // Идентификаторы копий детерминированные: `${origId}::t${tripId}` — findOrCreate идемпотентен.
  latestPerIngredient(rows: any[]): any[] {
    return latestPerIngredientImpl(rows);
  },
  snapProductForTrip(tripId: string, p: any): any {
    return snapProductForTripImpl(tripId, p);
  },
  snapRecipeForTrip(tripId: string, r: any): any {
    return snapRecipeForTripImpl(mockServer, tripId, r);
  },
  /**
   * FORM-meal-composition-spec §4.2/§4.4: GET/PUT /trips/:t/meals/:m/composition.
   * In-memory правки (substitutions-хранилище) трактуются ровно как на бэкенде
   * (MealCompositionService): SCALE = from===to, EXTRA = added (абсолют на приём,
   * хранится per-serving), EXCLUDE = removed/to=null, SUBST = from→to × ratio.
   */
  handleMealComposition(method: string, tripId: string, mealId: string, body?: any): any {
    return handleMealCompositionImpl(mockServer, method, tripId, mealId, body);
  },
  /** Атомарный диф-коммит желаемого состояния (паритет с MealCompositionService.putComposition). */
  applyCompositionPut(tripId: string, day: any, meal: any, recipe: any, body: any): void {
    return applyCompositionPutImpl(tripId, day, meal, recipe, body);
  },
  /** Сборка ответа composition — тот же порядок, что §3 и buildResponse на Java. */
  buildCompositionResponse(trip: any, day: any, meal: any, recipe: any): any {
    return buildCompositionResponseImpl(trip, day, meal, recipe);
  },
  handleTrips(method: string, path: string, body?: any): any {
    return handleTripsImpl(mockServer, method, path, body);
  },
  // Авторизация
  handleAuth(method: string, path: string, body?: any): any {
    return handleAuthImpl(method, path, body);
  },
};
