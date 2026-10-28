/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';

/**
 * U11 mock-parity: маршруты /admin/integrations* повторяют IntegrationController:
 * GET список (IntegrationDto), POST connect/disconnect, GET sync-logs (SyncLogDto),
 * POST :provider/sync/prices → {logId} с фоновым завершением лога,
 * 409 INTEGRATION_DISCONNECTED / SYNC_ALREADY_RUNNING, 404 для неизвестного
 * провайдера, GET products/search (ExternalProductDto), POST ingredients/:id/mapping.
 */
const call = (method: string, path: string, body?: unknown) =>
  mockServer.handleRequest<any>(method, path, body as any);

const grab = (fn: () => unknown): any => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('Ожидалась ошибка (409/404), но вызов прошёл');
};

describe('MOCK-INTEGRATIONS: /admin/integrations* (U11 parity)', () => {
  it('GET /admin/integrations — список интеграций в форме IntegrationDto', () => {
    const list = call('GET', '/admin/integrations', null);
    expect(Array.isArray(list)).toBe(true);
    expect(list[0]).toMatchObject({ provider: 'ROSSTAT' });
    expect(list[0]).toHaveProperty('status');
    expect(list[0]).toHaveProperty('lastSyncAt');
    expect(list[0]).toHaveProperty('errorMessage');
  });

  it('disconnect блокирует синк (409 INTEGRATION_DISCONNECTED), connect возвращает статус', () => {
    const off = call('POST', '/admin/integrations/ROSSTAT/disconnect', null);
    expect(off.status).toBe('DISCONNECTED');

    const err = grab(() => call('POST', '/admin/integrations/ROSSTAT/sync/prices', null));
    expect(err.status).toBe(409);
    expect(err.message).toBe('INTEGRATION_DISCONNECTED');

    const on = call('POST', '/admin/integrations/ROSSTAT/connect', null);
    expect(on.status).toBe('CONNECTED');
    // Паритет с бэкендом: служебное сообщение, а не ошибка
    expect(on.errorMessage).toBe('Connected successfully');
  });

  it('sync/prices → {logId}, поверх running 409, лог фоново завершается SUCCESS со счётчиками', async () => {
    const res = call('POST', '/admin/integrations/ROSSTAT/sync/prices', null);
    expect(typeof res.logId).toBe('number');

    const err = grab(() => call('POST', '/admin/integrations/ROSSTAT/sync/prices', null));
    expect(err.status).toBe(409);
    expect(err.message).toBe('SYNC_ALREADY_RUNNING');

    const running = call('GET', '/admin/integrations/sync-logs', null);
    expect(running[0]).toMatchObject({ provider: 'ROSSTAT', type: 'PRICES', status: 'RUNNING' });
    expect(running[0].finishedAt).toBeNull();

    // Фоновое «завершение» синка (1.5 с) — как executePriceSync на реальном бэкенде
    await new Promise(r => setTimeout(r, 1700));

    const done = call('GET', '/admin/integrations/sync-logs', null);
    expect(done[0].status).toBe('SUCCESS');
    expect(done[0].createdCount).toBeGreaterThan(0);
    expect(done[0].updatedCount).toBeGreaterThan(0);
    expect(done[0].finishedAt).toBeTruthy();

    const list = call('GET', '/admin/integrations', null);
    expect(list[0].lastSyncAt).toBeTruthy();
  });

  it('неизвестный провайдер → 404 (паритет с IntegrationService)', () => {
    const err = grab(() => call('POST', '/admin/integrations/HACKER/sync/prices', null));
    expect(err.status).toBe(404);
    const err2 = grab(() => call('POST', '/admin/integrations/HACKER/connect', null));
    expect(err2.status).toBe(404);
  });

  it('products/search отдаёт ExternalProductDto, mapping возвращает 200 (null-тело)', () => {
    // Fix-13: каталог — категории Росстата (ЕМИСС), поиск по подстроке
    const found = call('GET', '/admin/integrations/ROSSTAT/products/search?query=греч&limit=20', null);
    expect(found.length).toBe(1);
    expect(found[0]).toMatchObject({ code: '101', brand: 'Росстат', packUnit: 'KG' });
    expect(found[0].name).toBe('Гречневая крупа');

    const all = call('GET', '/admin/integrations/ROSSTAT/products/search?query=&limit=20', null);
    expect(all.length).toBeGreaterThanOrEqual(5);

    const mapped = call('POST', '/admin/integrations/ingredients/1/mapping', {
      provider: 'ROSSTAT',
      externalCode: '101',
      packAmount: 1,
      packUnit: 'KG',
    });
    expect(mapped).toBeNull();
  });

  it('Fix-14: products/search отдаёт цену категории (price/priceDate)', () => {
    const found = call('GET', '/admin/integrations/ROSSTAT/products/search?query=греч&limit=20', null);
    expect(found[0]).toMatchObject({ code: '101', packUnit: 'KG' });
    expect(typeof found[0].price).toBe('number');
    expect(found[0].priceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('Fix-14: привязки — upsert (POST), список (GET), отвязка (DELETE)', () => {
    // Первая привязка ингредиента 2 → появляется в списке
    expect(call('POST', '/admin/integrations/ingredients/2/mapping',
      { provider: 'ROSSTAT', externalCode: '102', packAmount: 1, packUnit: 'L' })).toBeNull();
    let list = call('GET', '/admin/integrations/ROSSTAT/mappings', null);
    let b2 = list.find((b: any) => b.ingredientId === 2);
    expect(b2).toBeTruthy();
    expect(b2.externalCode).toBe('102');

    // Повторная привязка ТОГО ЖЕ ингредиента = замена товара (upsert), не дубль
    call('POST', '/admin/integrations/ingredients/2/mapping',
      { provider: 'ROSSTAT', externalCode: '104', packAmount: 1, packUnit: 'KG' });
    list = call('GET', '/admin/integrations/ROSSTAT/mappings', null);
    const b2again = list.filter((b: any) => b.ingredientId === 2);
    expect(b2again.length).toBe(1);
    expect(b2again[0].externalCode).toBe('104');

    // Отвязка удаляет запись
    expect(call('DELETE', '/admin/integrations/ingredients/2/mapping/ROSSTAT', null)).toBeNull();
    list = call('GET', '/admin/integrations/ROSSTAT/mappings', null);
    expect(list.find((b: any) => b.ingredientId === 2)).toBeUndefined();

    // Отвязка отсутствующей → 404 (паритет с deleteMapping)
    const err = grab(() => call('DELETE', '/admin/integrations/ingredients/2/mapping/ROSSTAT', null));
    expect(err.status).toBe(404);
  });
});
