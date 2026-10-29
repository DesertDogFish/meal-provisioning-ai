/**
 * Подзадача 24 (план plans/done/2026-10-29-full-audit.md): покрытие оставшихся путей
 * client.ts после выделения authInterceptor/modeResolver/problemDetailParser —
 * mock-ветки (failMode, postFile, del), обёртки загрузки/нормализации и
 * форматтеры (humanize/packHint/humanizeWeight).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiClientError,
  getMealComposition,
  getRecipes,
  getTripRecipes,
  humanize,
  humanizeWeight,
  packHint,
  putMealComposition,
  updateRecipeIngredients,
} from './client';
import type { Recipe } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApiClient — mock-ветки (R5-покрытие после декомпозиции)', () => {
  it('failMode → ApiClientError «Mock Server Error»', async () => {
    api.setMode('mock');
    await expect(api.get('/recipes', { failMode: '/recipes' }))
      .rejects.toMatchObject({ name: 'ApiClientError', error: { status: 500, title: 'Mock Server Error' } });
  });

  it('del: DELETE неизвестного блюда → 404 из mock-сервера', async () => {
    api.setMode('mock');
    await expect(api.del('/admin/recipes/rec_missing')).rejects.toMatchObject({ status: 404 });
  });

  it('postFile: пустой файл → EMPTY_FILE 400 (mock-паритет бэкенда)', async () => {
    api.setMode('mock');
    const empty = new File([], 'empty.xml');
    await expect(api.postFile('/admin/integrations/ROSSTAT/upload', empty))
      .rejects.toMatchObject({ status: 400, message: 'EMPTY_FILE' });
  });
});

describe('Обёртки загрузки — нормализация плоских DTO бэкенда', () => {
  const flatRecipe = {
    id: '7',
    name: 'Каша',
    mealType: 'BREAKFAST',
    baseServings: 4,
    ingredients: [
      { ingredientId: 100, ingredientName: 'Гречневая крупа', unit: 'KG', categoryName: 'Крупы', packSize: 0.8, roundToPacks: true, pieceWeightG: null, kcalPer100g: 336, amount: 0.4 },
    ],
  } as unknown as Recipe;

  it('getRecipes(search) → query-параметр + normalizeRecipe', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue([flatRecipe] as never);
    const res = await getRecipes('  каша  ');
    expect(spy).toHaveBeenCalledWith('/recipes?search=%D0%BA%D0%B0%D1%88%D0%B0');
    const ing = res[0].ingredients[0].ingredient!;
    expect(ing.name).toBe('Гречневая крупа');
    expect(ing.unit).toBe('KG');
    expect((ing as any).category).toBe('Крупы');
    expect((ing as any).packSize).toBe(0.8);
  });

  it('getTripRecipes — та же нормализация для trip-снепшотов (V20)', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue([flatRecipe] as never);
    const res = await getTripRecipes(3);
    expect(spy).toHaveBeenCalledWith('/trips/3/recipes');
    expect(res[0].ingredients[0].ingredient?.name).toBe('Гречневая крупа');
  });

  it('updateRecipeIngredients: полный RecipeRequest в PUT + нормализация ответа', async () => {
    const spy = vi.spyOn(api, 'put').mockResolvedValue(flatRecipe as never);
    const res = await updateRecipeIngredients(flatRecipe, [{ ingredientId: '100', amount: 0.5 }]);
    expect(spy).toHaveBeenCalledWith('/admin/recipes/7', expect.objectContaining({
      name: 'Каша',
      mealType: 'BREAKFAST',
      baseServings: 4,
      ingredients: [{ ingredientId: '100', amount: 0.5 }],
    }));
    expect(res.ingredients[0].ingredient?.name).toBe('Гречневая крупа');
  });

  it('getMealComposition / putMealComposition — маршруты §4.2', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ items: [] } as never);
    await getMealComposition('1', '2');
    expect(getSpy).toHaveBeenCalledWith('/trips/1/meals/2/composition');

    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ items: [] } as never);
    await putMealComposition('1', '2', { items: [], substitutions: [] });
    expect(putSpy).toHaveBeenCalledWith('/trips/1/meals/2/composition', { items: [], substitutions: [] });
  });
});

describe('Форматтеры (делегирование в format.ts и фасовка §2.2)', () => {
  it('humanize → formatQty', () => {
    expect(humanize(1.5, 'KG')).toBe('1,5 кг');
    expect(humanize(0.2, 'KG')).toBe('200 г');
  });

  it('packHint: KG-фасовка → граммы на упаковку; PCS → «упаковка × N»; pieceWeightG; иначе null', () => {
    expect(packHint({ unit: 'KG', packSize: 0.8 })).toContain('800 г / упаковка');
    // ru-RU ставит неразрывный пробел между разрядами: «1 500»
    expect(packHint({ unit: 'L', packSize: 1.5 })).toMatch(/1[\s\u00A0]500 мл \/ упаковка/);
    expect(packHint({ unit: 'PCS', packSize: 10 })).toContain('упаковка × 10 шт');
    expect(packHint({ unit: 'PCS', pieceWeightG: 250 })).toBe('1 шт = 250 г');
    expect(packHint({ unit: 'KG' })).toBeNull();
  });

  it('humanizeWeight: <1000 → г; ≥1000 → кг; null/NaN → «—»', () => {
    expect(humanizeWeight(500)).toBe('500 г');
    expect(humanizeWeight(1500)).toBe('1,5 кг');
    expect(humanizeWeight(null)).toBe('—');
    expect(humanizeWeight(NaN)).toBe('—');
  });

  it('ApiClientError экспортируется из client.ts (публичный контракт)', () => {
    const err = new ApiClientError({ status: 400, title: 'Bad' });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Bad');
  });
});
