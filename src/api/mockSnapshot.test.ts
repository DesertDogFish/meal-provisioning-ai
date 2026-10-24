/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';

/**
 * V20 (mock-паритет): поход работает с trip-scoped копиями каталога.
 * Глобальный справочник и цены не затрагиваются планированием похода.
 */
const call = (method: string, path: string, body?: unknown) =>
  mockServer.handleRequest<any>(method, path, body as any);

describe('MOCK-SNAPSHOT (V20): изоляция каталога похода', () => {
  it('добавление приёма пищи создаёт копии: каталог чист, план заморожен, глобал удалим', () => {
    const globals = call('GET', '/recipes', null);
    // блюдо не должно быть занято legacy-походами сида (те держат глобальные ссылки до снепшота),
    // иначе корректный 409 RECIPE_IN_USE помешает проверке удаления
    const usedRecipeIds = new Set(
      call('GET', '/trips', null)
        .flatMap((t: any) => t.days || [])
        .flatMap((d: any) => d.meals || [])
        .map((m: any) => m.recipeId)
    );
    const recipe = globals.find(
      (r: any) => !usedRecipeIds.has(r.id) && (r.ingredients || []).length > 0 && r.ingredients[0].ingredient
    );
    expect(recipe).toBeTruthy();
    const firstIngName = recipe.ingredients[0].ingredient.name as string;
    const secondIngName = recipe.ingredients.length > 1 ? recipe.ingredients[1].ingredient.name as string : firstIngName;
    const recipesBefore = globals.length;
    const productsBefore = call('GET', '/admin/products', null).content.length;

    const trip = call('POST', '/trips', {
      name: 'Снепшот-тест',
      startDate: '2026-12-01',
      endDate: '2026-12-02',
      defaultPeople: 2,
    });
    const dayId = trip.days[0].id;

    // 1) приём пищи ссылается на копию, а не на справочник
    const meal = call('POST', `/trips/${trip.id}/days/${dayId}/meals`, {
      recipeId: recipe.id,
      mealType: 'DINNER',
    });
    expect(meal.recipeId).not.toBe(recipe.id);
    expect(String(meal.recipeId)).toContain(`::t${trip.id}`);

    // 2) каталоги не засвечены копиями
    expect(call('GET', '/recipes', null).length).toBe(recipesBefore);
    expect(call('GET', '/admin/products', null).content.length).toBe(productsBefore);

    // 3) цены похода — по копиям
    const tripPrices = call('GET', `/trips/${trip.id}/prices`, null);
    expect(tripPrices.some((p: any) => String(p.ingredientId).includes('::t'))).toBe(true);

    // 4) правка глобальной цены не меняет план похода
    const globalIngId = recipe.ingredients[0].ingredientId;
    const frozen = tripPrices.find((p: any) => p.ingredientId === `${globalIngId}::t${trip.id}`)?.pricePerUnit;
    expect(frozen).toBeTruthy();
    const today = new Date().toISOString().slice(0, 10);
    call('POST', '/admin/ingredient-prices', {
      ingredientId: globalIngId,
      pricePerUnit: 999.99,
      currency: 'RUB',
      effectiveFrom: today,
    });
    const after = call('GET', `/trips/${trip.id}/prices`, null)
      .find((p: any) => p.ingredientId === `${globalIngId}::t${trip.id}`)?.pricePerUnit;
    expect(after).toBe(frozen);
    const globalNow = call('GET', '/prices', null).find((p: any) => p.ingredientId === globalIngId)?.pricePerUnit;
    expect(globalNow).toBe(999.99);

    // 5) админ свободно удаляет глобальное блюдо; поход продолжает считаться
    call('DELETE', `/admin/recipes/${recipe.id}`, null);
    expect(call('GET', '/recipes', null).find((r: any) => r.id === recipe.id)).toBeUndefined();
    // копии блюд похода живы и несут состав (моковый summary/shopping — фикстура
    // контрактных тестов, поэтому проверяем через /trips/:id/recipes)
    const tripRecipes = call('GET', `/trips/${trip.id}/recipes`, null);
    const copy = tripRecipes.find((r: any) => r.id === meal.recipeId);
    expect(copy).toBeTruthy();
    const copyIngNames = copy.ingredients.map((ri: any) => ri.ingredient?.name);
    expect(copyIngNames).toContain(firstIngName);
    expect(copyIngNames).toContain(secondIngName);
  });

  it('legacy-поход без снепшотов: /trips/:id/prices падает на глобальный срез', () => {
    const legacy = call('GET', '/trips/trip1/prices', null);
    expect(legacy.length).toBeGreaterThan(0);
    expect(legacy.every((p: any) => !String(p.ingredientId).includes('::t'))).toBe(true);
  });
});
