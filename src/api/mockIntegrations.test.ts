/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';

/**
 * U11 mock-parity: маршруты /admin/integrations* повторяют IntegrationController:
 * GET список (IntegrationDto), POST connect/disconnect, GET sync-logs (SyncLogDto),
 * POST :provider/sync/prices → {logId} с фоновым завершением лога,
 * 409 INTEGRATION_DISCONNECTED / SYNC_ALREADY_RUNNING, 404 для неизвестного провайдера.
 *
 * Тесты ручной привязки (products/search, ingredients/:id/mapping) удалены вместе с
 * функциональностью: V28 снесла ingredient_mappings/external_products, привязка
 * продукта к позиции ЕМИСС живёт в ingredients.emis_code и правится в редакторе продукта.
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
});
