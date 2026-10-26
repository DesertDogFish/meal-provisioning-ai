/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';

/**
 * CONTRACT-P1: CRUD рецептов в mock-режиме должен повторять бэкенд:
 * POST/PUT/DELETE /admin/recipes, 400 c errors[], 404; U16: DELETE занятого
 * рецепта больше не 409 — приём перепривязывается на снепшот-копию (паритет V20).
 */
const call = (method: string, path: string, body?: unknown) =>
  mockServer.handleRequest<any>(method, path, body as any);

describe('MOCK-RECIPES: CRUD /admin/recipes', () => {
  const productId = () => call('GET', '/admin/products', null).content[0].id;

  it('POST создаёт рецепт и он виден в GET /recipes', () => {
    const created = call('POST', '/admin/recipes', {
      name: 'Тест-блюдо агента',
      mealType: 'SNACK',
      category: 'ПЕРЕКУСЫ',
      cookMinutes: 5,
      baseServings: 2,
      ingredients: [{ ingredientId: productId(), amount: 0.25 }],
    });
    expect(created.id).toBeTruthy();
    expect(created.source).toBe('MANUAL');
    const list = call('GET', '/recipes', null);
    const found = list.find((r: any) => r.id === created.id);
    expect(found).toBeDefined();
    expect(found.ingredients.length).toBe(1);
    expect(found.ingredients[0].ingredient).toBeTruthy();
    // cleanup для независимости тестов
    call('DELETE', `/admin/recipes/${created.id}`, null);
  });

  it('PUT заменяет состав целиком', () => {
    const created = call('POST', '/admin/recipes', {
      name: 'Блюдо для правки',
      mealType: 'LUNCH',
      baseServings: 1,
      ingredients: [{ ingredientId: productId(), amount: 0.1 }],
    });
    const products = call('GET', '/admin/products', null).content;
    const updated = call('PUT', `/admin/recipes/${created.id}`, {
      name: 'Блюдо после правки',
      mealType: 'DINNER',
      baseServings: 1,
      cookMinutes: 0,
      ingredients: [
        { ingredientId: products[0].id, amount: 0.2 },
        { ingredientId: products[1].id, amount: 1 },
      ],
    });
    expect(updated.name).toBe('Блюдо после правки');
    expect(updated.mealType).toBe('DINNER');
    expect(updated.ingredients.length).toBe(2);
    call('DELETE', `/admin/recipes/${created.id}`, null);
  });

  it('POST с пустым именем и составом → 400 c errors[]', () => {
    let caught: any = null;
    try {
      call('POST', '/admin/recipes', { name: '  ', mealType: 'NOPE', baseServings: 0, ingredients: [] });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught.status).toBe(400);
    expect(Array.isArray(caught.errors)).toBe(true);
    expect(caught.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('PUT/DELETE неизвестного id → 404', () => {
    let caught: any = null;
    try {
      call('PUT', '/admin/recipes/rec_missing', { name: 'x', mealType: 'LUNCH', baseServings: 1, ingredients: [] });
    } catch (e) {
      caught = e;
    }
    expect(caught?.status).toBe(404);
    let caught2: any = null;
    try {
      call('DELETE', '/admin/recipes/rec_missing', null);
    } catch (e) {
      caught2 = e;
    }
    expect(caught2?.status).toBe(404);
  });

  it('U16: DELETE рецепта, занятого в походе, — без 409: каталог чист, приём перепривязан на снепшот-копию', () => {
    const trips = call('GET', '/trips', null);
    const usedRecipeId = trips
      .flatMap((t: any) => t.days ?? [])
      .flatMap((d: any) => d.meals ?? [])
      .map((m: any) => m.recipeId)[0];
    expect(usedRecipeId).toBeTruthy();
    const tripId = trips.find((t: any) =>
      (t.days ?? []).some((d: any) => (d.meals ?? []).some((m: any) => m.recipeId === usedRecipeId))
    ).id;
    // не бросает — удаление занятого рецепта больше не конфликт
    call('DELETE', `/admin/recipes/${usedRecipeId}`, null);
    // из глобального каталога блюдо исчезло
    const globals = call('GET', '/recipes', null);
    expect(globals.some((r: any) => r.id === usedRecipeId)).toBe(false);
    // поход жив: приём ссылается на trip-scoped копию `${id}::t${tripId}`
    const trip = call('GET', `/trips/${tripId}`, null);
    const meals = (trip.days ?? []).flatMap((d: any) => d.meals ?? []);
    expect(meals.some((m: any) => m.recipeId === `${usedRecipeId}::t${tripId}`)).toBe(true);
  });
});
