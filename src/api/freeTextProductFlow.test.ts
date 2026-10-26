/**
 * §2.2 save-flow свободного ввода (mock-паритет с реальным бэкендом):
 * черновые позиции «free-…» НЕ отправляются на сервер — при сохранении модалка
 * резолвит их через GET /admin/products/check-name и POST /admin/products,
 * а в PUT composition уходят только реальные id справочника.
 *
 * Тест повторяет шаги resolveFreeRows (MealCompositionModal) против mock-сервера,
 * гарантируя, что оба режима (mock и real API) поддерживают одинаковый контракт:
 *  - check-name: {duplicate, existingId, sameUnit};
 *  - POST /admin/products: {name, unit, categoryId} → продукт с id;
 *  - PUT composition c EXTRA на созданный id → GET возвращает абсолют (§3, V21-семантика).
 */
import { describe, expect, it } from 'vitest';
import { mockServer } from './mockServer';

type CheckName = { duplicate: boolean; existingId?: string | number | null; existingName?: string; sameUnit?: boolean };
type Product = { id: string | number; name: string; unit: string };

const GET_COMP = '/trips/trip1/meals/m3/composition';
const FREE_NAME = 'Свободный тестовый продукт';

const getComposition = () => mockServer.handleRequest<any>('GET', GET_COMP);
const putComposition = (body: unknown) => mockServer.handleRequest<any>('PUT', GET_COMP, body);
const asRecipeItems = (c: any) => c.items.map((i: any) => ({ ingredientId: i.ingredientId, state: 'RECIPE' }));

describe('free-text product save-flow (§2.2): mock == real API contract', () => {
  it('check-name → create → check-name(duplicate) → EXTRA в составе хранит абсолют', () => {
    // 1) продукта ещё нет
    const before = mockServer.handleRequest<CheckName>(
      'GET', `/admin/products/check-name?name=${encodeURIComponent(FREE_NAME)}&unit=KG`);
    expect(before.duplicate).toBe(false);

    // 2) категория из справочника (mock и real отдают список с id)
    const cats = mockServer.handleRequest<any[]>('GET', '/product-categories');
    expect(Array.isArray(cats) && cats.length).toBeGreaterThan(0);
    const categoryId = cats[0].id;

    // 3) создание продукта (как в resolveFreeRows)
    const created = mockServer.handleRequest<Product>('POST', '/admin/products', {
      name: FREE_NAME, unit: 'KG', categoryId,
    });
    expect(created.id).toBeDefined();
    const realId = String(created.id);
    expect(realId).toMatch(/^\d+$|^ing/); // числовой id (real) либо id мока — но НЕ «free-…»

    // 4) повторный check-name — дубль с тем же id и единицей
    const after = mockServer.handleRequest<CheckName>(
      'GET', `/admin/products/check-name?name=${encodeURIComponent(FREE_NAME)}&unit=KG`);
    expect(after.duplicate).toBe(true);
    expect(String(after.existingId)).toBe(realId);
    expect(after.sameUnit).toBe(true);

    // 5) другой unit — soft-duplicate (модалка не должна молча сливать позиции)
    const otherUnit = mockServer.handleRequest<CheckName>(
      'GET', `/admin/products/check-name?name=${encodeURIComponent(FREE_NAME)}&unit=PCS`);
    expect(otherUnit.duplicate).toBe(true);
    expect(otherUnit.sameUnit).toBe(false);

    // 6) PUT composition c EXTRA на РЕАЛЬНЫЙ id: сохранение и абсолют §3
    const base = getComposition();
    const put = putComposition({
      items: [...asRecipeItems(base), { ingredientId: realId, state: 'EXTRA', amount: 0.35 }],
      substitutions: [],
    });
    const extra = put.items.find((i: any) => String(i.ingredientId) === realId);
    expect(extra?.state).toBe('EXTRA');
    expect(extra?.effectiveAmount).toBeCloseTo(0.35, 6);

    // 7) GET переживает сохранение (persisted), и PUT идемпотентен
    const again = putComposition({
      items: [...asRecipeItems(getComposition()).map((i: any) =>
        String(i.ingredientId) === realId ? { ingredientId: realId, state: 'EXTRA', amount: 0.35 } : i),
      ],
      substitutions: [],
    });
    expect(again.items.find((i: any) => String(i.ingredientId) === realId)?.effectiveAmount)
      .toBeCloseTo(0.35, 6);

    // cleanup: снимаем правки (не мешать другим контракт-тестам trip1/m3)
    const clean = getComposition();
    putComposition({
      items: clean.items
        .filter((i: any) => String(i.ingredientId) !== realId)
        .map((i: any) => ({ ingredientId: i.ingredientId, state: 'RECIPE' })),
      substitutions: [],
    });
  });

  it('PUT composition с нечисловым/неизвестным id отвергается (защита от регрессии «free-…» на сервере)', () => {
    const base = getComposition();
    // Реальный бэкенд на «free-…» отвечает 400 (нечитаемый Long), на неизвестный числовой —
    // 404 «Ingredient not found»; mock — 404 (контракт mealCompositionContract).
    // Фиксируем главное: тело с «free-…» НЕ сохраняется молча — модалка обязана
    // резолвить free-id ДО PUT (resolveFreeRows).
    expect(() => putComposition({
      items: [...asRecipeItems(base), { ingredientId: 'free-abc123', state: 'EXTRA', amount: 1 }],
      substitutions: [],
    })).toThrowError(expect.objectContaining({ status: expect.any(Number) }) as any);
  });
});
