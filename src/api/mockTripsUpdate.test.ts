/**
 * Патч «UX-список 26.10»: mock-паритет новых роутов.
 *  - U36: PUT /trips/:id — редактирование похода; смена дат перегенерирует дни
 *    (план стирается) — семантика, которую должен повторить backend (PLAN, backend-долг).
 *  - U40: GET/POST/DELETE /trips/:id/manual-items — ручные позиции закупки (PLAN R3).
 *  - U30: GET /trips/:id/substitutions — обогащение именами (паритет с backend
 *    SubstitutionResponse: recipeName/fromIngredientName/toIngredientName).
 */
import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';

const req = <T,>(method: string, path: string, body?: unknown) =>
  mockServer.handleRequest<T>(method, path, body as any);

function createTrip(start = '2026-06-01', end = '2026-06-03') {
  return req<any>('POST', '/trips', {
    name: 'Тестовый поход U36',
    startDate: start,
    endDate: end,
    defaultPeople: 3,
    notes: 'заметка',
  });
}

describe('mock PUT /trips/:id (U36)', () => {
  it('переименование/заметки/люди — дни сохраняются (id те же)', () => {
    const trip = createTrip();
    const before = trip.days.map((d: any) => d.id);
    const updated = req<any>('PUT', `/trips/${trip.id}`, {
      name: 'Новое имя',
      startDate: trip.startDate,
      endDate: trip.endDate,
      defaultPeople: 5,
      notes: 'обновлено',
    });
    expect(updated.name).toBe('Новое имя');
    expect(updated.defaultPeople).toBe(5);
    expect(updated.notes).toBe('обновлено');
    expect(updated.days.map((d: any) => d.id)).toEqual(before);
  });

  it('смена дат БЕЗ пересечения — старые дни стираются вместе с приёмами', () => {
    const trip = createTrip('2026-06-01', '2026-06-03');
    const dayId = trip.days[0].id;
    const recipes = req<any[]>('GET', '/recipes');
    req('POST', `/trips/${trip.id}/days/${dayId}/meals`, { recipeId: recipes[0].id, mealType: 'LUNCH' });

    const updated = req<any>('PUT', `/trips/${trip.id}`, {
      name: trip.name,
      startDate: '2026-07-05',
      endDate: '2026-07-06',
      defaultPeople: trip.defaultPeople,
    });
    expect(updated.startDate).toBe('2026-07-05');
    expect(updated.days).toHaveLength(2);
    for (const d of updated.days) expect(d.meals).toHaveLength(0);
  });

  it('Fix-2 (п.1): смена дат с пересечением — общие дни сохраняются (те же id и приёмы), стираются только ушедшие', () => {
    const trip = createTrip('2026-06-01', '2026-06-03'); // дни: 01, 02, 03
    const recipes = req<any[]>('GET', '/recipes');
    // приём во ВТОРОЙ день (06-02) — он попадёт в новый диапазон
    req('POST', `/trips/${trip.id}/days/${trip.days[1].id}/meals`, { recipeId: recipes[0].id, mealType: 'LUNCH' });
    const secondDayId = trip.days[1].id;

    const updated = req<any>('PUT', `/trips/${trip.id}`, {
      name: trip.name,
      startDate: '2026-06-02', // 06-01 уходит, 06-02/03 остаются, 06-04 добавляется
      endDate: '2026-06-04',
      defaultPeople: trip.defaultPeople,
    });
    expect(updated.days).toHaveLength(3);
    expect(updated.days.map((d: any) => d.dayDate)).toEqual(['2026-06-02', '2026-06-03', '2026-06-04']);
    // пересекшийся день — ТОТ ЖЕ (id сохранён) и с приёмом
    expect(updated.days[0].id).toBe(secondDayId);
    expect(updated.days[0].meals).toHaveLength(1);
    // новый день — пустой
    expect(updated.days[2].meals).toHaveLength(0);
  });

  it('чужой/несуществующий поход — 404', () => {
    expect(() => req('PUT', '/trips/nope-404', { name: 'x' })).toThrow(/404|Not found/i);
  });
});

describe('mock manual-items (U40)', () => {
  it('позиция на весь поход (dayId=null) и к дню — создаются, читаются, удаляются', () => {
    const trip = createTrip();
    const products = req<any>('GET', '/admin/products');
    const product = products.content.find((p: any) => p.unit === 'PCS') ?? products.content[0];

    const tripItem = req<any>('POST', `/trips/${trip.id}/manual-items`, {
      ingredientId: product.id, amount: 1, note: 'аптечка',
    });
    expect(tripItem.id).toBeTruthy();
    expect(tripItem.dayId).toBeNull();
    expect(tripItem.ingredientName).toBe(product.name);
    expect(tripItem.unit).toBe(product.unit);

    const dayItem = req<any>('POST', `/trips/${trip.id}/manual-items`, {
      dayId: trip.days[0].id, ingredientId: product.id, amount: 3,
    });
    expect(dayItem.dayId).toBe(trip.days[0].id);

    const list = req<any[]>('GET', `/trips/${trip.id}/manual-items`);
    expect(list).toHaveLength(2);

    req('DELETE', `/trips/${trip.id}/manual-items/${tripItem.id}`);
    expect(req<any[]>('GET', `/trips/${trip.id}/manual-items`)).toHaveLength(1);
  });

  it('валидации: неизвестный продукт — 404, amount<=0 — 400, неизвестный день — 404', () => {
    const trip = createTrip();
    expect(() => req('POST', `/trips/${trip.id}/manual-items`, { ingredientId: 'nope', amount: 1 }))
      .toThrow(/404|Not found/i);
    const products = req<any>('GET', '/admin/products');
    const pid = products.content[0].id;
    expect(() => req('POST', `/trips/${trip.id}/manual-items`, { ingredientId: pid, amount: 0 }))
      .toThrow(/400|Bad request/i);
    expect(() => req('POST', `/trips/${trip.id}/manual-items`, { ingredientId: pid, amount: 1, dayId: 'd-nope' }))
      .toThrow(/404|Not found/i);
  });

  it('Fix-2 (п.1): смена дат — дневная позиция ушедшего дня стирается, походная (dayId=null) survives', () => {
    const trip = createTrip('2026-06-01', '2026-06-03');
    const products = req<any>('GET', '/admin/products');
    const pid = products.content[0].id;
    const firstDayId = trip.days[0].id;   // 06-01 — уйдёт из диапазона
    const secondDayId = trip.days[1].id;  // 06-02 — останется
    req('POST', `/trips/${trip.id}/manual-items`, { ingredientId: pid, amount: 2, dayId: firstDayId });
    req('POST', `/trips/${trip.id}/manual-items`, { ingredientId: pid, amount: 1, dayId: secondDayId });
    req('POST', `/trips/${trip.id}/manual-items`, { ingredientId: pid, amount: 1 }); // на поход

    req<any>('PUT', `/trips/${trip.id}`, { ...trip, startDate: '2026-06-02', endDate: '2026-06-04' });
    const items = req<any[]>('GET', `/trips/${trip.id}/manual-items`);
    expect(items).toHaveLength(2);
    expect(items.some(i => i.dayId == null)).toBe(true);
    expect(items.some(i => i.dayId === secondDayId)).toBe(true);
  });

  it('GET /trips/:id/ingredient-edits — полный список правок с именами (паритет с backend)', () => {
    const trip = createTrip();
    const recipes = req<any[]>('GET', '/recipes');
    const recipe = recipes.find(r => (r.ingredients || []).length >= 2) ?? recipes[0];
    const [a, b] = recipe.ingredients;
    req('POST', `/trips/${trip.id}/substitutions`, {
      recipeId: recipe.id, fromIngredientId: a.ingredientId, toIngredientId: b.ingredientId, ratio: 1,
    });
    const edits = req<any[]>('GET', `/trips/${trip.id}/ingredient-edits`);
    expect(edits.length).toBeGreaterThan(0);
    const sub = edits.find(e => String(e.fromIngredientId) === String(a.ingredientId))!;
    expect(sub.recipeName).toBe(recipe.name);
    expect(typeof sub.fromIngredientName).toBe('string');
    expect(sub.fromIngredientName.length).toBeGreaterThan(0);
  });
});

describe('mock GET /trips/:id/substitutions — обогащение именами (U30)', () => {
  it('после создания замены GET отдаёт recipeName/fromIngredientName/toIngredientName', () => {
    const trip = createTrip();
    const recipes = req<any[]>('GET', '/recipes');
    const recipe = recipes.find(r => (r.ingredients || []).length >= 2) ?? recipes[0];
    const [a, b] = recipe.ingredients;
    req('POST', `/trips/${trip.id}/substitutions`, {
      recipeId: recipe.id,
      fromIngredientId: a.ingredientId,
      toIngredientId: b.ingredientId,
      ratio: 1,
    });
    const list = req<any[]>('GET', `/trips/${trip.id}/substitutions`);
    expect(list.length).toBeGreaterThan(0);
    const sub = list.find(s => s.fromIngredientId === String(a.ingredientId))!;
    expect(sub.recipeName).toBe(recipe.name);
    expect(typeof sub.fromIngredientName).toBe('string');
    expect(sub.fromIngredientName.length).toBeGreaterThan(0);
    expect(typeof sub.toIngredientName).toBe('string');
    expect(sub.toUnit).toBeTruthy();
  });

  it('добавленная позиция (from=null) — added=true, toIngredientName заполнено', () => {
    const trip = createTrip();
    const recipes = req<any[]>('GET', '/recipes');
    const recipe = recipes[0];
    const products = req<any>('GET', '/admin/products');
    const extra = products.content.find((p: any) =>
      !(recipe.ingredients || []).some((ri: any) => String(ri.ingredientId) === String(p.id)),
    ) ?? products.content[products.content.length - 1];
    req('POST', `/trips/${trip.id}/substitutions`, {
      recipeId: recipe.id,
      fromIngredientId: null,
      toIngredientId: extra.id,
      amountPerServing: 0.05,
    });
    const list = req<any[]>('GET', `/trips/${trip.id}/substitutions`);
    const add = list.find(s => s.added && String(s.toIngredientId) === String(extra.id))!;
    expect(add).toBeTruthy();
    expect(add.toIngredientName).toBe(extra.name);
  });
});
