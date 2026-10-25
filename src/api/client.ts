/**
 * CR-5: Единая точка входа в данные
 * Два адаптера: mock (in-memory + localStorage) и real (fetch + VITE_API_URL)
 * Выбор режима: localStorage → VITE_API_MODE → auto-пинг GET /api/v1/meta
 */

import type { MealType, Recipe, UnitOfMeasure } from '../types';

export interface ApiError {
  status: number;
  type?: string;
  title: string;
  detail?: string;
  instance?: string;
  errors?: Array<{ field: string; message: string; rejectedValue?: unknown }>;
  // Контракт совпадает с бэкендом ErrorResponse.UsedInResource (record):
  // resourceType / resourceId / resourceName (id — число, Long→String Jackson не применяется к error-телам).
  usedIn?: Array<{ resourceType: string; resourceId: number; resourceName: string }>;
}

export class ApiClientError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.detail || error.title);
    this.name = 'ApiClientError';
  }
}

export type ApiMode = 'mock' | 'real';

const SEED_VERSION = '1.0.0';
const LS_MODE_KEY = 'apiMode';
const LS_SEED_KEY = 'seedVersion';
const LS_ACCESS_KEY = 'accessToken';
const LS_REFRESH_KEY = 'refreshToken';

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

/** Вызывается при безвозвратной потере сессии (refresh не помог) */
type SessionLostHandler = () => void;

function emitSessionLost() {
  window.dispatchEvent(new Event('auth:session-lost'));
}

export class ApiClient {
  private mode: ApiMode = 'mock';
  private baseUrl: string;
  private modeResolved = false;
  private resolvePromise: Promise<void> | null = null;

  constructor() {
    // NOTE: window['meta'] — намеренно нестатический доступ: Vite заменяет статическое
    // обращение import.meta.env.* на литералы при сборке, из-за чего тестовые подмены
    // (vi.stubEnv / присваивание) не применяются. В браузере window.meta пуст → fallback.
    // window.meta.env — канал подмены env в тестах; сам объект meta может быть
    // задан без вложенного env, поэтому берём env из meta с fallback.
    const injectedMeta = (window as unknown as { meta?: { env?: Record<string, string> } }).meta;
    const env: Record<string, string> =
      injectedMeta?.env ??
      injectedMeta ??
      ((import.meta as any).env || {});
    this.baseUrl = env.VITE_API_URL || 'http://localhost:8080/api/v1';
    
    const storedMode = localStorage.getItem(LS_MODE_KEY) as ApiMode | null;
    const envMode = env.VITE_API_MODE as ApiMode | undefined;
    
    if (storedMode === 'mock' || storedMode === 'real') {
      this.mode = storedMode;
      this.modeResolved = true;
    } else if (envMode === 'mock' || envMode === 'real') {
      this.mode = envMode;
      this.modeResolved = true;
    } else {
      this.mode = 'mock'; // default
    }
    
    // Проверка seedVersion
    const storedSeed = localStorage.getItem(LS_SEED_KEY);
    if (storedSeed !== SEED_VERSION) {
      localStorage.setItem(LS_SEED_KEY, SEED_VERSION);
      // При смене версии сида можно очистить данные
    }
  }

  getMode(): ApiMode {
    return this.mode;
  }

  isResolved(): boolean {
    return this.modeResolved;
  }

  async resolveMode(): Promise<ApiMode> {
    if (this.modeResolved) return this.mode;
    if (this.resolvePromise) return this.resolvePromise.then(() => this.mode);
    
    this.resolvePromise = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 700);
        
        const response = await fetch(`${this.baseUrl}/meta`, {
          signal: controller.signal,
          method: 'GET'
        });
        clearTimeout(timeout);
        
        if (response.ok) {
          this.mode = 'real';
        }
      } catch {
        this.mode = 'mock';
      } finally {
        this.modeResolved = true;
        localStorage.setItem(LS_MODE_KEY, this.mode);
      }
    })();
    
    await this.resolvePromise;
    return this.mode;
  }

  setMode(mode: ApiMode) {
    this.mode = mode;
    this.modeResolved = true;
    localStorage.setItem(LS_MODE_KEY, mode);
  }

  resetSeedData() {
    localStorage.removeItem(LS_SEED_KEY);
    localStorage.removeItem('mockData');
    localStorage.setItem(LS_SEED_KEY, SEED_VERSION);
  }

  private getToken(): string | null {
    return localStorage.getItem(LS_ACCESS_KEY);
  }

  /**
   * P0.5#1: обновление access-токена по refresh-токену.
   * Single-flight: параллельные 401 ждут один общий refresh,
   * чтобы не устроить гонку ротации refresh-токенов на бэкенде.
   */
  private refreshPromise: Promise<boolean> | null = null;

  private refreshTokens(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const refreshToken = localStorage.getItem(LS_REFRESH_KEY);
      if (!refreshToken) return false;
      try {
        // fetch напрямую: этот вызов сам не должен попадать в retry-цикл
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        if (!response.ok) return false;
        const data = (await response.json()) as AuthTokens;
        if (!data.accessToken) return false;
        localStorage.setItem(LS_ACCESS_KEY, data.accessToken);
        // Бэкенд ротирует refresh-токен (старый удаляется) — сохраняем новый
        if (data.refreshToken) {
          localStorage.setItem(LS_REFRESH_KEY, data.refreshToken);
        }
        return true;
      } catch {
        return false;
      } finally {
        // сбрасываем lock асинхронно, чтобы все дождавшиеся уже получили результат
        const p = this.refreshPromise;
        this.refreshPromise = null;
        void p;
      }
    })();

    return this.refreshPromise;
  }

  private clearSession() {
    localStorage.removeItem(LS_ACCESS_KEY);
    localStorage.removeItem(LS_REFRESH_KEY);
  }

  /** Подписка на событие безвозвратной потери сессии (для ProtectedRoute/Layout) */
  onSessionLost(handler: SessionLostHandler): () => void {
    window.addEventListener('auth:session-lost', handler);
    return () => window.removeEventListener('auth:session-lost', handler);
  }

  private async sendAuthHeader(
    method: string,
    url: string,
    body?: unknown
  ): Promise<Response> {
    const token = this.getToken();
    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { failMode?: string; params?: Record<string, string> }
  ): Promise<T> {
    // Авто-резолв режима если ещё не определён
    if (!this.modeResolved) {
      await this.resolveMode();
    }

    let fullPath = path;
    if (options?.params) {
      const params = new URLSearchParams(options.params);
      fullPath += (path.includes('?') ? '&' : '?') + params.toString();
    }

    if (this.mode === 'mock') {
      // Имитация задержки 200-400 мс
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
      
      // Режим ошибок для тестирования
      if (options?.failMode && fullPath.includes(options.failMode)) {
        throw new ApiClientError({
          status: 500,
          title: 'Mock Server Error',
          detail: `Simulated failure for route: ${options.failMode}`
        });
      }
      
      const { mockServer } = await import('./mockServer');
      return mockServer.handleRequest<T>(method, fullPath, body);
    }

    // Real API
    const url = `${this.baseUrl}${fullPath}`;

    let response = await this.sendAuthHeader(method, url, body);

    // P0.5#1: 401 от protected-эндпоинта → один refresh + повтор исходного запроса.
    // Запросы к /auth/* не ретраим (иначе гонка ротации и рекурсия).
    if (
      response.status === 401 &&
      !path.startsWith('/auth/') &&
      this.getToken() &&
      localStorage.getItem(LS_REFRESH_KEY)
    ) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        response = await this.sendAuthHeader(method, url, body);
      } else {
        this.clearSession();
        emitSessionLost();
      }
    }

    if (!response.ok) {
      let errorData: ApiError;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          status: response.status,
          title: 'Unknown Error',
          detail: response.statusText
        };
      }
      throw new ApiClientError(errorData);
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  async get<T>(path: string, options?: { failMode?: string; params?: Record<string, string> }): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('POST', path, body, options);
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
          category: '',
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

export function humanize(amount: number, unit: UnitOfMeasure): string {
  if (amount == null || isNaN(amount)) return '—';
  switch (unit) {
    case 'KG':
      return amount < 1 ? `${Math.round(amount * 1000)} г` : `${amount.toFixed(2)} кг`;
    case 'L':
      return amount < 1 ? `${Math.round(amount * 1000)} мл` : `${amount.toFixed(2)} л`;
    case 'PCS':
      return `${Math.round(amount)} шт`;
    case 'PACK':
      return `${Math.round(amount)} уп`;
    default:
      return `${amount}`;
  }
}

export function formatMoney(value: number | null | undefined, currency = 'RUB'): string {
  if (value == null) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency === 'RUB' ? '₽' : currency}`;
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
      return `≈ ${perPack.toLocaleString('ru-RU')} ${item.unit === 'L' ? 'мл' : 'г'} / упаковка (${pack} ${label})`;
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
