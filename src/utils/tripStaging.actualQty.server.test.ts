/**
 * BL-27: серверная синхронизация ФАКТИЧЕСКОГО количества чеклиста похода.
 *
 * Факт количества ({amount, unit}) переезжает из localStorage на сервер (V37), но
 * localStorage остаётся кэшем и буфером офлайн-записи — ровно как у отметок «взято».
 * Семантика намеренно НЕ копирует union из KB-15: у факта нет «надгробий» удалений,
 * поэтому union воскрешал бы стёртое значение. Отсюда:
 *   - чистый кэш → серверный набор ПОЛНОСТЬЮ заменяет локальный;
 *   - dirty (офлайн-правка) → локальная карта авторитетна и досылается целиком;
 *   - сервер недоступен → локальную карту не трогаем, dirty не снимаем.
 *
 * Сервер эмулируется здесь: PUT — полная замена набора, GET — снимок на момент вызова.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const st = vi.hoisted(() => ({
  /** tripId -> набор [{ingredientId, amount, unit}] «на сервере» */
  server: new Map<string, Array<{ ingredientId: string; amount: number; unit: string }>>(),
  putDelays: [] as number[],
  putCalls: [] as Array<Array<{ ingredientId: string; amount: number; unit: string }>>,
  concurrent: 0,
  maxConcurrent: 0,
  putFails: false,
  holdFirstGet: false,
  releaseGet: null as null | (() => void),
  getCalls: 0,
}));

vi.mock('../api/client', () => {
  const parseTrip = (path: string) => {
    const m = /^\/trips\/([^/]+)\/checklist-actual-qty$/.exec(path);
    if (!m) throw new Error(`unexpected url ${path}`);
    return m[1];
  };
  return {
    api: {
      // GET — снимок серверного набора НА МОМЕНТ вызова (ответ может прийти позже)
      get: vi.fn((path: string) => {
        const tripId = parseTrip(path);
        st.getCalls += 1;
        const shot = (st.server.get(tripId) ?? []).map(it => ({ ...it }));
        if (st.holdFirstGet && st.getCalls === 1) {
          st.holdFirstGet = false;
          return new Promise(resolve => { st.releaseGet = () => resolve(shot); });
        }
        return Promise.resolve(shot);
      }),
      // PUT — идемпотентная ПОЛНАЯ замена набора
      put: vi.fn(async (path: string, body: { items: Array<{ ingredientId: string; amount: number; unit: string }> }) => {
        const tripId = parseTrip(path);
        const callIndex = st.putCalls.length;
        st.concurrent += 1;
        st.maxConcurrent = Math.max(st.maxConcurrent, st.concurrent);
        try {
          const delay = st.putDelays[callIndex] ?? 0;
          if (delay) await new Promise(r => setTimeout(r, delay));
          if (st.putFails) throw new Error('offline');
          const items = (body.items ?? []).map(it => ({ ...it }));
          st.putCalls.push(items);
          st.server.set(tripId, items);
          return items;
        } finally {
          st.concurrent -= 1;
        }
      }),
      post: vi.fn(),
      del: vi.fn(),
    },
  };
});

import { api } from '../api/client';

import {
  loadActualQty,
  setActualQty,
  refreshActualQtyFromServer,
  flushActualQtyPuts,
  flushPendingStageWrites,
  forgetTripActualQtySyncState,
} from './tripStaging';

const TRIP = 't1';
const DIRTY_KEY = `trip-checklist-actualqty-dirty-${TRIP}`;
const QTY_KEY = `trip-checklist-actualqty-${TRIP}`;
/** Кэш в LS, оставшийся от другой сессии/устройства (без dirty-флага). */
const seedCache = (map: Record<string, { amount: number; unit: string }>) =>
  localStorage.setItem(QTY_KEY, JSON.stringify(map));
const putItems = () => st.putCalls.map(call => call.map(it => `${it.ingredientId}=${it.amount}${it.unit}`));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  st.server.clear();
  st.putCalls = [];
  st.putDelays = [];
  st.concurrent = 0;
  st.maxConcurrent = 0;
  st.putFails = false;
  st.holdFirstGet = false;
  st.releaseGet = null;
  st.getCalls = 0;
  forgetTripActualQtySyncState(TRIP);
});

describe('BL-27 (A): «сервер побеждает» для чистого кэша', () => {
  it('факт изменён на другом устройстве → после refresh локально серверное значение', async () => {
    seedCache({ ing5: { amount: 1, unit: 'кг' } });          // устаревший кэш
    st.server.set(TRIP, [{ ingredientId: 'ing5', amount: 2, unit: 'кг' }]);

    const result = await refreshActualQtyFromServer(TRIP);

    expect(result).toEqual({ ing5: { amount: 2, unit: 'кг' } });
    expect(loadActualQty(TRIP)).toEqual({ ing5: { amount: 2, unit: 'кг' } });
    expect(st.putCalls).toEqual([]);                          // обратно не досылаем
  });

  it('факт стёрт на сервере → локальный кэш очищается (удаление ПРИМЕНЕНО)', async () => {
    seedCache({ ing5: { amount: 1, unit: 'кг' } });
    st.server.set(TRIP, []);

    const result = await refreshActualQtyFromServer(TRIP);

    expect(result).toEqual({});
    expect(loadActualQty(TRIP)).toEqual({});
    expect(st.putCalls).toEqual([]);
  });

  it('серверный набор заменяет локальный ПОЛНОСТЬЮ (не union)', async () => {
    seedCache({ ing5: { amount: 1, unit: 'кг' }, ing6: { amount: 3, unit: 'шт' } });
    st.server.set(TRIP, [{ ingredientId: 'ing6', amount: 3, unit: 'шт' }]);

    await refreshActualQtyFromServer(TRIP);

    expect(loadActualQty(TRIP)).toEqual({ ing6: { amount: 3, unit: 'шт' } });
  });

  it('серверный id ложится на существующий trip-scoped локальный ключ', async () => {
    seedCache({ 'ing5::ttrip1': { amount: 1, unit: 'кг' } });
    st.server.set(TRIP, [{ ingredientId: 'ing5', amount: 4, unit: 'кг' }]);

    await refreshActualQtyFromServer(TRIP);

    expect(loadActualQty(TRIP)).toEqual({ 'ing5::ttrip1': { amount: 4, unit: 'кг' } });
  });
});

describe('BL-27 (A): dirty-флаг — локальная карта авторитетна до успешного PUT', () => {
  it('офлайн-правка (dirty) → локальный факт не затёрт и дослан; после успеха dirty снят', async () => {
    st.putFails = true;                                       // в магазине нет связи
    setActualQty(TRIP, 'ing5', { amount: 2, unit: 'кг' });
    await flushActualQtyPuts(TRIP);
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');
    expect(loadActualQty(TRIP)).toEqual({ ing5: { amount: 2, unit: 'кг' } });

    st.putFails = false;
    st.server.set(TRIP, [{ ingredientId: 'ing6', amount: 3, unit: 'шт' }]); // чужая правка
    st.putCalls = [];

    const result = await refreshActualQtyFromServer(TRIP);
    await flushActualQtyPuts(TRIP);

    expect(result).toEqual({ ing5: { amount: 2, unit: 'кг' } });  // локальное не потеряно
    expect(putItems()[putItems().length - 1]).toEqual(['ing5=2кг']); // и дослано
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();            // dirty снят при успехе
  });

  it('dirty переживает перезагрузку страницы (персистентный флаг, не данные)', async () => {
    seedCache({ ing7: { amount: 500, unit: 'г' } });
    localStorage.setItem(DIRTY_KEY, '1');
    st.server.set(TRIP, []);

    const result = await refreshActualQtyFromServer(TRIP);
    await flushActualQtyPuts(TRIP);

    expect(result).toEqual({ ing7: { amount: 500, unit: 'г' } }); // серверное «пусто» не затёрло
    expect(putItems()[putItems().length - 1]).toEqual(['ing7=500г']);
  });

  it('сервер недоступен (null) → локальные факты не затираются, dirty сохраняется', async () => {
    st.putFails = true;
    setActualQty(TRIP, 'ing7', { amount: 1, unit: 'кг' });
    await flushActualQtyPuts(TRIP);
    st.putCalls = [];

    vi.mocked(api.get).mockImplementationOnce(() => Promise.reject(new Error('ECONNREFUSED')));
    const result = await refreshActualQtyFromServer(TRIP);

    expect(result).toEqual({ ing7: { amount: 1, unit: 'кг' } });
    expect(st.putCalls).toEqual([]);                   // ничего не досылаем вслепую
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1'); // dirty не сброшен
  });

  it('мягкий таймаут: сервер не ответил → экран не висит, работаем на локальном кэше', async () => {
    seedCache({ ing3: { amount: 2, unit: 'шт' } });
    st.holdFirstGet = true;
    const started = Date.now();

    const result = await refreshActualQtyFromServer(TRIP, { timeoutMs: 20 });

    expect(Date.now() - started).toBeLessThan(500);
    expect(result).toEqual({ ing3: { amount: 2, unit: 'шт' } });
    expect(st.getCalls).toBe(1);
  });
});

describe('BL-27 (B): гонки PUT — строго последовательно, последний набор побеждает', () => {
  it('две быстрые правки не уходят параллельно и на сервере остаётся ПОСЛЕДНЯЯ', async () => {
    st.putDelays = [40, 0];
    setActualQty(TRIP, 'ing1', { amount: 1, unit: 'кг' });
    setActualQty(TRIP, 'ing1', { amount: 2, unit: 'кг' });
    setActualQty(TRIP, 'ing2', { amount: 5, unit: 'шт' });
    await flushActualQtyPuts(TRIP);

    expect(st.maxConcurrent).toBe(1);                             // строго по очереди
    expect(st.server.get(TRIP)).toEqual([                            // побеждает последний
      { ingredientId: 'ing1', amount: 2, unit: 'кг' },
      { ingredientId: 'ing2', amount: 5, unit: 'шт' },
    ]);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
  });

  it('снятие факта уходит на сервер полной заменой (удаление реально применяется)', async () => {
    setActualQty(TRIP, 'ing1', { amount: 1, unit: 'кг' });
    setActualQty(TRIP, 'ing2', { amount: 2, unit: 'шт' });
    await flushActualQtyPuts(TRIP);
    setActualQty(TRIP, 'ing2', null);        // снял второй факт
    await flushActualQtyPuts(TRIP);

    expect(st.server.get(TRIP)).toEqual([{ ingredientId: 'ing1', amount: 1, unit: 'кг' }]);
  });
});

describe('BL-27 (C): неотправляемые пары не держат dirty вечно', () => {
  it('невалидная пара отбрасывается из локального кэша, валидные уезжают', async () => {
    seedCache({
      ing1: { amount: 2, unit: 'кг' },        // валидная
      ing2: { amount: 0, unit: 'кг' },        // amount <= 0 — не отправить
      ing3: { amount: 1, unit: '' },          // пустая единица — не отправить
    });
    localStorage.setItem(DIRTY_KEY, '1');

    const result = await refreshActualQtyFromServer(TRIP);
    await flushActualQtyPuts(TRIP);

    expect(result).toEqual({ ing1: { amount: 2, unit: 'кг' } });
    expect(st.server.get(TRIP)).toEqual([{ ingredientId: 'ing1', amount: 2, unit: 'кг' }]);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();  // флаг снят, вечного dirty нет
  });

  it('событие online досылает отложенные правки похода', async () => {
    st.putFails = true;
    setActualQty(TRIP, 'ing9', { amount: 3, unit: 'шт' });
    await flushActualQtyPuts(TRIP);
    expect(st.server.get(TRIP) ?? []).toEqual([]);

    st.putFails = false;
    st.putCalls = [];
    await flushPendingStageWrites();

    expect(putItems().some(call => call.includes('ing9=3шт'))).toBe(true);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
  });
});
