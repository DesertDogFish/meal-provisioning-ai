/**
 * CR-5: Единая точка входа в данные
 * Два адаптера: mock (in-memory + localStorage) и real (fetch + VITE_API_URL)
 * Выбор режима: localStorage → VITE_API_MODE → auto-пинг GET /api/v1/meta
 *
 * Подзадача 24 (план plans/done/2026-10-29-full-audit.md): ApiClient — только оркестрация;
 * составные части вынесены в отдельные модули (поведение сохранено дословно):
 *  - `modeResolver.ts` — резолв режима (localStorage → VITE_API_MODE → auto-пинг /meta, Fix-11);
 *  - `authInterceptor.ts` — токены, single-flight refresh на 401 (P0.5#1), 401-retry,
 *    очистка сессии и событие `auth:session-lost`;
 *  - `problemDetailParser.ts` — ProblemDetail → ApiClientError, 204/пустое тело → null.
 */

import type { MealType, Recipe, UnitOfMeasure } from '../types';
import { formatQty } from '../utils/format';
import { ApiClientError, readEnvelope } from './problemDetailParser';
import type { ApiError } from './problemDetailParser';
import { AuthInterceptor } from './authInterceptor';
import type { SessionLostHandler } from './authInterceptor';
import { ModeResolver, readInjectedEnv } from './modeResolver';
import type { ApiMode } from './modeResolver';

// Публичный контракт прежний: типы и ошибка импортируются из client.ts
export type { ApiError, ApiMode, SessionLostHandler };
export { ApiClientError };

export class ApiClient {
  private baseUrl: string;
  private readonly modes = new ModeResolver();
  private readonly auth = new AuthInterceptor();

  constructor() {
    // Канал подмены env (window.meta → import.meta.env fallback) — см. readInjectedEnv
    const env = readInjectedEnv();
    this.baseUrl = env.VITE_API_URL || 'http://localhost:8080/api/v1';
  }

  getMode(): ApiMode {
    return this.modes.getMode();
  }

  isResolved(): boolean {
    return this.modes.isResolved();
  }

  async resolveMode(): Promise<ApiMode> {
    return this.modes.resolveMode(this.baseUrl);
  }

  setMode(mode: ApiMode) {
    this.modes.setMode(mode);
  }

  resetSeedData() {
    this.modes.resetSeedData();
  }

  /** Подписка на событие безвозвратной потери сессии (для ProtectedRoute/Layout) */
  onSessionLost(handler: SessionLostHandler): () => void {
    return this.auth.onSessionLost(handler);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { failMode?: string; params?: Record<string, string> }
  ): Promise<T> {
    // Авто-резолв режима если ещё не определён
    if (!this.modes.isResolved()) {
      await this.modes.resolveMode(this.baseUrl);
    }

    let fullPath = path;
    if (options?.params) {
      const params = new URLSearchParams(options.params);
      fullPath += (path.includes('?') ? '&' : '?') + params.toString();
    }

    if (this.modes.getMode() === 'mock') {
      // Fix-10 (п.4): имитация задержки — реалистичная, но не тянущая демо
      // (раньше 200–400 мс на КАЖДЫЙ запрос; на деплое без бэкенда каждый экран
      // делал серию запросов и «плыл»). Дефолт 100–180 мс; полный ноль —
      // VITE_MOCK_LATENCY_MS=0 (мгновенный mock для тестов/разработки).
      const envLat = (import.meta as any).env?.VITE_MOCK_LATENCY_MS;
      const base = envLat != null && Number.isFinite(Number(envLat)) ? Number(envLat) : 100;
      const jitter = base > 0 ? Math.random() * 80 : 0;
      await new Promise(resolve => setTimeout(resolve, base + jitter));

      // Режим ошибок для тестирования
      if (options?.failMode && fullPath.includes(options.failMode)) {
        throw new ApiClientError({
          status: 500,
          title: 'Mock Server Error',
          detail: `Simulated failure for route: ${options.failMode}`
        });
      }

      // transparency-п.4 / BL-52 (вариант A): в прод-сборке без VITE_ENABLE_MOCK
      // ветка статически мертва (import.meta.env.* заменяется литералами) — rollup
      // не эмитит чанк mockServer в прод-артефакт; runtime-защита на случай
      // «протухшего» localStorage: человеческая ошибка вместо тихих демо-данных.
      if (import.meta.env.PROD && import.meta.env.VITE_ENABLE_MOCK !== 'true') {
        throw new ApiClientError({
          status: 503,
          title: 'Сервер недоступен',
          detail: 'Демо-режим отключён в этой сборке, а бэкенд не отвечает. Повторите попытку позже.',
          type: 'about:blank',
        });
      }
      const { mockServer } = await import('./mockServer');
      return mockServer.handleRequest<T>(method, fullPath, body);
    }

    // Real API
    const url = `${this.baseUrl}${fullPath}`;

    const response = await this.auth.sendAuthHeader(method, url, body);

    // P0.5#1: 401 от protected-эндпоинта → один refresh + повтор исходного запроса
    // (запросы к /auth/* не ретраятся); неудачный refresh → очистка сессии и
    // событие auth:session-lost. Всё — в authInterceptor.retryOnUnauthorized.
    const finalResponse = await this.auth.retryOnUnauthorized({
      response, path, method, url, body, baseUrl: this.baseUrl
    });

    return readEnvelope<T>(finalResponse);
  }

  async get<T>(path: string, options?: { failMode?: string; params?: Record<string, string> }): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * Загрузка файла (multipart/form-data) — выгрузка ЕМИСС SDMX из раздела
   * «Интеграции» (POST /admin/integrations/:provider/upload → 202 { logId }).
   *
   * <p>Отдельный метод: JSON-тело здесь не подходит. В mock-режиме вместо
   * байтов уходит описание файла ({ name, size }) — mock-серверу достаточно
   * имени, чтобы повторить поведение бэкенда (EMPTY_FILE / snapshotSource).</p>
   */
  async postFile<T>(path: string, file: File, fieldName = 'file'): Promise<T> {
    if (!this.modes.isResolved()) {
      await this.modes.resolveMode(this.baseUrl);
    }

    if (this.modes.getMode() === 'mock') {
      // transparency-п.4 / BL-52: та же защита, что в request() (прод — без mock-чанка)
      if (import.meta.env.PROD && import.meta.env.VITE_ENABLE_MOCK !== 'true') {
        throw new ApiClientError({
          status: 503,
          title: 'Сервер недоступен',
          detail: 'Демо-режим отключён в этой сборке, а бэкенд не отвечает. Повторите попытку позже.',
          type: 'about:blank',
        });
      }
      const { mockServer } = await import('./mockServer');
      return mockServer.handleRequest<T>('POST', path, {
        __file: { name: file.name, size: file.size },
      });
    }

    const form = new FormData();
    form.append(fieldName, file, file.name);
    const response = await this.auth.sendFile(`${this.baseUrl}${path}`, form);
    return readEnvelope<T>(response);
  }

  async put<T>(path: string, body?: unknown, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  async del<T>(path: string, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

export const api = new ApiClient();

/**
 * ЗАДАЧА 1 (аудит коннекшенов): бэкенд в GET /recipes отдаёт плоские поля
 * ingredientId/ingredientName/unit/unitLabel, а UI читает вложенный ri.ingredient?.name.
 * Нормализуем ответ в одном месте: подставляем ingredient из плоских полей, если он отсутствует.
 * В mock-режиме ingredient уже есть — там нормализация ничего не меняет.
 */
export function normalizeRecipe(recipe: Recipe): Recipe {
  if (!Array.isArray(recipe.ingredients)) return recipe;
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ri) => ({
      ...ri,
      ingredient:
        ri.ingredient ??
        ({
          id: String(ri.ingredientId),
          name: (ri as unknown as { ingredientName?: string }).ingredientName ?? 'Неизвестный',
          unit: ((ri as unknown as { unit?: UnitOfMeasure }).unit ??
            (ri as unknown as { unitLabel?: UnitOfMeasure }).unitLabel ??
            'PCS') as UnitOfMeasure,
          // Fix-2 (п.3/4): плоский DTO бэкенда расширен categoryName/packSize/roundToPacks/
          // pieceWeightG/kcalPer100g — без них чеклист и чек в real-режиме
          // не-админа попадали целиком в «Прочее» и не знали фасовку.
          category: (ri as unknown as { categoryName?: string }).categoryName ?? '',
          packSize: (ri as unknown as { packSize?: number }).packSize,
          roundToPacks: (ri as unknown as { roundToPacks?: boolean }).roundToPacks,
          pieceWeightG: (ri as unknown as { pieceWeightG?: number }).pieceWeightG,
          kcalPer100g: (ri as unknown as { kcalPer100g?: number }).kcalPer100g,
          createdAt: '',
        } as import('../types').Ingredient),
    })),
  };
}

/** Единая точка загрузки рецептов (использовать вместо api.get('/recipes')) */
export async function getRecipes(search?: string): Promise<Recipe[]> {
  const qs = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  const data = await api.get<Recipe[]>(`/recipes${qs}`);
  return Array.isArray(data) ? data.map(normalizeRecipe) : data;
}

/**
 * Release-1.0 (UI-consistency): trip-scoped копии блюд (V20) — та же нормализация,
 * что и GET /recipes. Использовать вместо api.get(`/trips/${id}/recipes`):
 * без неё плоские DTO снапшотов дают «Unknown» и единицу «шт» по умолчанию.
 */
export async function getTripRecipes(tripId: string | number): Promise<Recipe[]> {
  const data = await api.get<Recipe[]>(`/trips/${tripId}/recipes`);
  return Array.isArray(data) ? data.map(normalizeRecipe) : data;
}

/**
 * Правка состава блюда (замена/добавление продукта) — PUT /admin/recipes/:id.
 * Бэкенд принимает полный RecipeRequest, поэтому прокидываем все поля блюда,
 * меняя только ingredients. Ответ нормализуем так же, как GET /recipes.
 */
export async function updateRecipeIngredients(
  recipe: Recipe,
  ingredients: { ingredientId: string; amount: number }[],
): Promise<Recipe> {
  const body = {
    name: recipe.name,
    mealType: recipe.mealType,
    category: recipe.category,
    cookMinutes: recipe.cookMinutes,
    baseServings: recipe.baseServings,
    caloriesPerServing: recipe.caloriesPerServing,
    ingredients,
  };
  const data = await api.put<Recipe>(`/admin/recipes/${recipe.id}`, body);
  return normalizeRecipe(data ?? { ...recipe, ingredients: ingredients as any });
}

/* =====================================================================
 * FORM-meal-composition-spec §4.2: эндпоинты состава приёма (Модалка B)
 * Типы — паритет с бэкендом MealCompositionDtos.java.
 * ===================================================================== */

/** Строка состава приёма; state: RECIPE | SCALED | EXTRA | EXCLUDED (§3). */
export interface CompositionItem {
  ingredientId: string;
  name: string;
  unit: UnitOfMeasure;
  packSize?: number | null;
  pieceWeightG?: number | null;
  kcalPer100g?: number | null;
  /** из рецепта на порцию (null для EXTRA) */
  baseAmountPerServing?: number | null;
  /** base/baseServings×people×ratio (null для EXTRA/EXCLUDED) */
  derivedAmount?: number | null;
  /** итог на приём (0 для EXCLUDED) */
  effectiveAmount: number;
  state: 'RECIPE' | 'SCALED' | 'EXTRA' | 'EXCLUDED';
  /** только для SCALED */
  ratio?: number | null;
  /** имя from-продукта для строки-получателя замены */
  substitutedFrom?: string | null;
  kcalTotal: number;
}

export interface CompositionSubstitution {
  id: string;
  fromIngredientId: string;
  fromName: string;
  toIngredientId: string;
  toName: string;
  ratio: number;
}

export interface CompositionResponse {
  mealId: string;
  dayDate: string;
  mealType: MealType;
  people: number;
  baseServings: number;
  recipeId: string;
  /** Fix-2 (п.7): id блюда в ГЛОБАЛЬНОМ каталоге (recipeId может быть trip-scoped
   * снепшотом) — для навигации «Изменить блюдо в справочнике» → /recipes?edit=. */
  catalogRecipeId?: string;
  recipeName: string;
  items: CompositionItem[];
  substitutions: CompositionSubstitution[];
  totals: { kcal: number; weightGrams: number; plannedCost: number };
}

/** Тело PUT composition: полный желаемый диф-состав (§4.2, атомарный batch-коммит). */
export interface CompositionPutRequest {
  items: Array<{
    ingredientId: string;
    state: 'RECIPE' | 'SCALED' | 'EXTRA' | 'EXCLUDED';
    amount?: number | null;
    ratio?: number | null;
  }>;
  substitutions: Array<{ fromIngredientId: string; toIngredientId: string; ratio?: number | null }>;
}

/** GET /trips/{t}/meals/{m}/composition — сервер считает ВСЁ масштабирование. */
export async function getMealComposition(tripId: string, mealId: string): Promise<CompositionResponse> {
  return api.get<CompositionResponse>(`/trips/${tripId}/meals/${mealId}/composition`);
}

/** PUT того же пути — атомарный диф-коммит; ответ = новый GET composition. */
export async function putMealComposition(
  tripId: string,
  mealId: string,
  body: CompositionPutRequest,
): Promise<CompositionResponse> {
  return api.put<CompositionResponse>(`/trips/${tripId}/meals/${mealId}/composition`, body);
}

// Утилиты для контракта
export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  KG: 'кг',
  L: 'л',
  PCS: 'шт',
  PACK: 'уп'
};

/**
 * Количество с единицей. Release-1.0 (UI-consistency): делегируем в formatQty —
 * одна реализация на всё приложение (запятая, адаптивная точность: «1,5 кг», «200 г»).
 */
export function humanize(amount: number, unit: UnitOfMeasure): string {
  return formatQty(amount, unit);
}

/**
 * FORM-meal-composition-spec §2.2: подсказка фасовки под инпутом количества —
 * «≈ 3 упак × 50 г» (packSize в кг/л → граммы на упаковку) или «1 шт = 250 г» (pieceWeightG).
 */
export function packHint(item: { unit?: UnitOfMeasure | string; packSize?: number | null; pieceWeightG?: number | null }): string | null {
  const pack = Number(item.packSize);
  if (pack > 0) {
    const label = UNIT_LABELS[item.unit as UnitOfMeasure] ?? String(item.unit ?? '');
    if (item.unit === 'KG' || item.unit === 'L') {
      const perPack = Math.round(pack * 1000); // кг/л → г/мл на упаковку
      return `≈ ${perPack.toLocaleString('ru-RU')} ${item.unit === 'L' ? 'мл' : 'г'} / упаковка (${pack.toLocaleString('ru-RU')} ${label})`;
    }
    return `≈ упаковка × ${pack.toLocaleString('ru-RU')} ${label}`;
  }
  const pw = Number(item.pieceWeightG);
  if (pw > 0) return `1 шт = ${pw.toLocaleString('ru-RU')} г`;
  return null;
}

/** Humanize веса итогов: <1000 г → «N г», иначе «N,NNN кг». */
export function humanizeWeight(grams: number | null | undefined): string {
  if (grams == null || isNaN(grams)) return '—';
  if (Math.abs(grams) < 1000) return `${Math.round(grams)} г`;
  return `${(grams / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} кг`;
}
