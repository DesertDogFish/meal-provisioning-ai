/**
 * P1 «Contract расширить (mock, локально)» — PLAN.md, Backlog P1 п.1.
 *
 * Исполняемая спецификация расширенного контракта mock-сервера:
 *  1. Алиас /admin/products ≡ /admin/ingredients — одинаковый count/форма (реальные
 *     потребители: BindingWizard/SubstitutionModal ходят на /admin/ingredients).
 *  2. Пагинация одной формой PageResponse (content/page/size/totalElements/
 *     totalPages/first/last) — как backend `PageResponse.of(...)`.
 *  3. 409-payload с машиночитаемыми кодами: DUPLICATE_PRODUCT, PRODUCT_IN_USE
 *     (+usedIn), DUPLICATE_PRICE_DATE, SYNC_ALREADY_RUNNING.
 *  4. unitLabel, planned/actual, packsToBuy/buyAmount/leftoverAmount/substitutedFrom
 *     в shopping-контракте (совпадает с backend ShoppingItemResponse).
 *
 * Red-green (R1): тесты написаны ДО реализации; падение на старом коде
 * зафиксировано в отчёте и PLAN.md (2026-10-22).
 */
import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';

const PAGE_KEYS = ['content', 'page', 'size', 'totalElements', 'totalPages', 'first', 'last'] as const;

describe('CONTRACT-P1-01: алиас products ≡ ingredients', () => {
  it('обе ручки отдают один и тот же count', () => {
    const products = mockServer.handleRequest<any>('GET', '/admin/products', null);
    const ingredients = mockServer.handleRequest<any>('GET', '/admin/ingredients', null);
    expect(ingredients.content.length).toBe(products.content.length);
    expect(ingredients.totalElements).toBe(products.totalElements);
  });

  it('одинаковая форма элементов: id/name/unit/unitLabel/category', () => {
    const products = mockServer.handleRequest<any>('GET', '/admin/products', null);
    const ingredients = mockServer.handleRequest<any>('GET', '/admin/ingredients', null);
    for (const key of ['id', 'name', 'unit', 'unitLabel', 'category']) {
      expect(ingredients.content[0][key]).toBeDefined();
      expect(typeof ingredients.content[0][key]).toBe(typeof products.content[0][key]);
    }
  });

  it('POST через алиас /admin/ingredients создаёт продукт (тот же обработчик)', () => {
    const created = mockServer.handleRequest<any>(
      'POST',
      '/admin/ingredients',
      { name: 'Тестовый алис-продукт', unit: 'KG', categoryId: 'cat8' },
    );
    expect(created.id).toBeDefined();
    expect(created.unitLabel).toBe('кг');
    const list = mockServer.handleRequest<any>('GET', '/admin/products', null);
    expect(list.content.some((p: any) => p.name === 'Тестовый алис-продукт')).toBe(true);
  });
});

describe('CONTRACT-P1-02: пагинация одной формой PageResponse', () => {
  it('GET /admin/products?page=0&size=5 — полная форма, slice по странице', () => {
    const res = mockServer.handleRequest<any>('GET', '/admin/products?page=0&size=5', null);
    for (const key of PAGE_KEYS) expect(res).toHaveProperty(key);
    expect(res.content.length).toBe(5);
    expect(res.page).toBe(0);
    expect(res.size).toBe(5);
    expect(res.first).toBe(true);
    expect(res.totalPages).toBe(Math.ceil(res.totalElements / 5));
    expect(res.last).toBe(false);
  });

  it('последняя страница короче полной и last=true', () => {
    const p0 = mockServer.handleRequest<any>('GET', '/admin/products?page=0&size=5', null);
    const lastPage = p0.totalPages - 1;
    const pl = mockServer.handleRequest<any>(
      'GET',
      `/admin/products?page=${lastPage}&size=5`,
      null,
    );
    expect(pl.first).toBe(false);
    expect(pl.last).toBe(true);
    expect(pl.content.length).toBe(p0.totalElements - lastPage * 5);
    // страницы не пересекаются
    const ids0 = new Set(p0.content.map((p: any) => p.id));
    expect(pl.content.every((p: any) => !ids0.has(p.id))).toBe(true);
  });

  it('алиас /admin/ingredients paginated отдаёт ту же форму', () => {
    const res = mockServer.handleRequest<any>('GET', '/admin/ingredients?page=0&size=3', null);
    for (const key of PAGE_KEYS) expect(res).toHaveProperty(key);
    expect(res.content.length).toBe(3);
  });

  it('size=0 не делит на ноль', () => {
    const res = mockServer.handleRequest<any>('GET', '/admin/products?page=0&size=0', null);
    expect(res.totalPages).toBe(0);
    expect(res.content.length).toBe(0);
  });
});

describe('CONTRACT-P1-03: 409-payload с машиночитаемыми кодами', () => {
  const grab = (fn: () => unknown) => {
    try {
      fn();
      throw new Error('expected throw');
    } catch (e: any) {
      return e;
    }
  };

  it('DUPLICATE_PRODUCT при создании дубликата (name+unit)', () => {
    const err = grab(() =>
      mockServer.handleRequest('POST', '/admin/products', { name: 'Гречка', unit: 'KG' }),
    );
    expect(err.status).toBe(409);
    expect(err.message).toBe('DUPLICATE_PRODUCT');
  });

  it('PRODUCT_IN_USE при удалении продукта, занятого в рецептах (+usedIn)', () => {
    // ing1 (Гречка) используется в рецептах сида
    const err = grab(() => mockServer.handleRequest('DELETE', '/admin/products/ing1', null));
    expect(err.status).toBe(409);
    expect(err.message).toBe('PRODUCT_IN_USE');
    expect(err.usedIn.length).toBeGreaterThan(0);
    expect(err.usedIn[0]).toMatchObject({ resourceType: 'RECIPE' });
  });

  it('PRODUCT_IN_USE при переименовании занятого продукта', () => {
    const err = grab(() =>
      mockServer.handleRequest('PUT', '/admin/products/ing1', { name: 'Ячка', unit: 'KG' }),
    );
    expect(err.status).toBe(409);
    expect(err.message).toBe('PRODUCT_IN_USE');
  });

  it('DUPLICATE_PRICE_DATE при повторной цене на ту же дату', () => {
    mockServer.handleRequest('POST', '/admin/ingredients/ing1/prices', {
      pricePerUnit: 100,
      currency: 'RUB',
      effectiveFrom: '2026-01-01',
    });
    const err = grab(() =>
      mockServer.handleRequest('POST', '/admin/ingredients/ing1/prices', {
        pricePerUnit: 200,
        currency: 'RUB',
        effectiveFrom: '2026-01-01',
      }),
    );
    expect(err.status).toBe(409);
    expect(err.message).toBe('DUPLICATE_PRICE_DATE');
  });

  it('SYNC_ALREADY_RUNNING при запуске синхронизации поверх running', () => {
    mockServer.handleRequest('POST', '/integrations/wildberries/sync', null);
    const err = grab(() =>
      mockServer.handleRequest('POST', '/integrations/wildberries/sync', null),
    );
    expect(err.status).toBe(409);
    expect(err.message).toBe('SYNC_ALREADY_RUNNING');
  });
});

describe('CONTRACT-P1-04: поля контракта в сводках', () => {
  it('shopping items содержат planned/actual пары', () => {
    const shopping = mockServer.handleRequest<any>('GET', '/trips/trip1/summary/shopping', null);
    expect(shopping.items.length).toBeGreaterThan(0);
    for (const item of shopping.items) {
      expect(item).toHaveProperty('plannedUnitPrice');
      expect(item).toHaveProperty('actualUnitPrice');
      expect(item).toHaveProperty('plannedCost');
      expect(item).toHaveProperty('actualCost');
      expect(item).toHaveProperty('overridden');
      expect(item).toHaveProperty('hasPlannedPrice');
      expect(item.unitLabel).toBeTruthy();
    }
    expect(shopping).toHaveProperty('totalPlannedCost');
    expect(shopping).toHaveProperty('totalActualCost');
    expect(shopping).toHaveProperty('deltaPercent');
  });

  it('shopping items содержат pack/leftover/substitution поля (ShoppingItemResponse)', () => {
    const shopping = mockServer.handleRequest<any>('GET', '/trips/trip1/summary/shopping', null);
    for (const item of shopping.items) {
      expect(item).toHaveProperty('packSize');
      expect(item).toHaveProperty('packsToBuy');
      expect(item).toHaveProperty('buyAmount');
      expect(item).toHaveProperty('leftoverAmount');
      expect(item).toHaveProperty('substitutedFrom');
    }
  });

  it('упаковки: roundToPacks даёт округление вверх и остаток', () => {
    const shopping = mockServer.handleRequest<any>('GET', '/trips/trip1/summary/shopping', null);
    const packed = shopping.items.find(
      (i: any) => i.roundToPacks && i.packSize && i.packsToBuy != null,
    );
    expect(packed).toBeDefined();
    expect(packed.packsToBuy).toBe(Math.ceil(packed.totalAmount / packed.packSize));
    expect(packed.buyAmount).toBeCloseTo(packed.packsToBuy * packed.packSize, 6);
    expect(packed.leftoverAmount).toBeCloseTo(packed.buyAmount - packed.totalAmount, 6);
  });

  it('замена: substitutedFrom проставлен у замещённого продукта', () => {
    const shopping = mockServer.handleRequest<any>('GET', '/trips/trip1/summary/shopping', null);
    const sub = shopping.items.find((i: any) => i.substitutedFrom);
    expect(sub).toBeDefined();
    expect(typeof sub.substitutedFrom).toBe('string');
  });

  it('price-overrides реально меняют actualCost (Задача 3 плана)', () => {
    const before = mockServer.handleRequest<any>('GET', '/trips/trip1/summary/shopping', null);
    const grechka = before.items.find((i: any) => i.ingredientName === 'Гречка');
    mockServer.handleRequest('PUT', '/trips/trip1/price-overrides/ing1', {
      ingredientId: 'ing1',
      actualPrice: 250,
      comment: 'contract test',
    });
    const after = mockServer.handleRequest<any>('GET', '/trips/trip1/summary/shopping', null);
    const grechkaAfter = after.items.find((i: any) => i.ingredientName === 'Гречка');
    expect(grechka.actualUnitPrice).not.toBe(250);
    expect(grechkaAfter.actualUnitPrice).toBe(250);
    expect(grechkaAfter.overridden).toBe(true);
    expect(grechkaAfter.actualCost).toBeCloseTo(250 * grechkaAfter.totalAmount, 6);
  });
});
