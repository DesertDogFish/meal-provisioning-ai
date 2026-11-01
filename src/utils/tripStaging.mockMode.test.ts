/**
 * KB-15 (аудит, MAJOR B): в mock-режиме каталог строковый ('ing7'), и ручные
 * позиции/замены дают именно такие id. Раньше клиент отбрасывал нечисловые id:
 *  - набор только из строковых → PUT не отправлялся вовсе → dirty навсегда;
 *  - смешанный набор → PUT проходил частично, dirty снимался, и следующая
 *    гидрация МОЛЧА стирала отметки строковых id.
 * Здесь синхронизация идёт через настоящий mock-сервер (валидация как у
 * backend: неизвестный продукт → 404), поэтому тест ловит и «не отправлено»,
 * и «стёрто серверным снимком».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client', async () => {
  const { mockServer } = await import('../api/mockServer');
  return {
    api: {
      get: async (path: string) => mockServer.handleRequest('GET', path, undefined),
      put: async (path: string, body?: unknown) => mockServer.handleRequest('PUT', path, body),
      post: vi.fn(),
      del: vi.fn(),
    },
  };
});

import { checklistBought } from '../api/mockState';
import { loadBought, setBought, refreshBoughtFromServer, flushBoughtPuts } from './tripStaging';

const TRIP = 'trip1';
const DIRTY_KEY = `trip-checklist-bought-dirty-${TRIP}`;

beforeEach(() => {
  localStorage.clear();
  delete checklistBought[TRIP];
});

describe('KB-15 (MAJOR B): mock-режим, строковые ingredientId', () => {
  it('набор только из строковых id: PUT уходит, dirty снимается, отметка переживает refresh', async () => {
    setBought(TRIP, new Set(['ing7@2000']));
    await flushBoughtPuts(TRIP);

    // сервер реального mock-а принял строковый id (раньше PUT не отправлялся)
    expect(checklistBought[TRIP]).toEqual([{ ingredientId: 'ing7', neededStamp: 2000 }]);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();

    const after = await refreshBoughtFromServer(TRIP);
    expect([...after]).toEqual(['ing7@2000']);
    expect([...loadBought(TRIP)]).toEqual(['ing7@2000']);
  });

  it('смешанный набор: после успешного PUT ничего не теряется на втором refresh', async () => {
    setBought(TRIP, new Set(['ing1@3000', 'ing7@2000']));
    await flushBoughtPuts(TRIP);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();

    await refreshBoughtFromServer(TRIP);
    const again = await refreshBoughtFromServer(TRIP);

    expect([...again].sort()).toEqual(['ing1@3000', 'ing7@2000']);
    expect([...loadBought(TRIP)].sort()).toEqual(['ing1@3000', 'ing7@2000']);
  });

  it('нулевая потребность в mock-режиме: <id>@0 принимается сервером (@PositiveOrZero)', async () => {
    setBought(TRIP, new Set(['ing7@0', 'ing1@3000']));
    await flushBoughtPuts(TRIP);

    expect(checklistBought[TRIP]).toEqual([
      { ingredientId: 'ing7', neededStamp: 0 },
      { ingredientId: 'ing1', neededStamp: 3000 },
    ]);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
  });
});
