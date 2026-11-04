/**
 * KB-15 (mock-паритет): GET/PUT /trips/{id}/checklist-bought в mock-сервере
 * должны вести себя ровно как backend ChecklistBought:
 *   GET -> [{ingredientId, neededStamp}];
 *   PUT {items:[...]} -> идемпотентная ПОЛНАЯ замена набора;
 *   неизвестный продукт -> 404 (ingredientRepository.findById → NotFound);
 *   кривой neededStamp/missing поле -> 400 (@NotNull Long); items > 2000 -> 400.
 *
 * Раньше мок «прощал» мусор (неизвестный id, neededStamp: null → Number(null)=0),
 * и клиент в mock-режиме не воспроизводил серверные ошибки (аудит KB-15, п.D).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { mockServer } from './mockServer';
import { checklistBought } from './mockState';

const TRIP = 'trip1';
const req = <T>(method: string, path: string, body?: unknown): T =>
  mockServer.handleRequest<T>(method, path, body);
const put = (items: unknown) => req('PUT', `/trips/${TRIP}/checklist-bought`, { items });
const getAll = () => req<any[]>('GET', `/trips/${TRIP}/checklist-bought`);

describe('CONTRACT KB-15: /trips/:id/checklist-bought (mock ≡ backend)', () => {
  beforeEach(() => { delete checklistBought[TRIP]; });

  it('GET пустого набора — []', () => {
    expect(getAll()).toEqual([]);
  });

  it('PUT — полная замена, GET отдаёт ту же форму [{ingredientId, neededStamp}]', () => {
    put([{ ingredientId: 'ing1', neededStamp: 5000 }, { ingredientId: 'ing2', neededStamp: 2000 }]);
    expect(getAll()).toEqual([
      { ingredientId: 'ing1', neededStamp: 5000 },
      { ingredientId: 'ing2', neededStamp: 2000 },
    ]);
  });

  it('PUT идемпотентен: повторный набор ЗАМЕНЯЕТ прежний (а не дополняет)', () => {
    put([{ ingredientId: 'ing1', neededStamp: 100 }]);
    put([{ ingredientId: 'ing2', neededStamp: 200 }]);
    expect(getAll()).toEqual([{ ingredientId: 'ing2', neededStamp: 200 }]);
    // пустой набор — тоже валидная замена («снять всё»)
    put([]);
    expect(getAll()).toEqual([]);
  });

  it('дубликаты пар схлопываются (уникальный индекс uq_tcb_trip_ingredient_stamp)', () => {
    put([
      { ingredientId: 'ing1', neededStamp: 100 },
      { ingredientId: 'ing1', neededStamp: 100 },
    ]);
    expect(getAll()).toEqual([{ ingredientId: 'ing1', neededStamp: 100 }]);
  });

  it('PUT без items → 400; неизвестный поход → 404', () => {
    expect(() => req('PUT', `/trips/${TRIP}/checklist-bought`, {}))
      .toThrow(expect.objectContaining({ status: 400 }));
    expect(() => req('GET', '/trips/nope/checklist-bought'))
      .toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('CONTRACT KB-15: серверная валидация набора (404/400)', () => {
  beforeEach(() => { delete checklistBought[TRIP]; });

  it('неизвестный ingredientId → 404 и набор НЕ меняется', () => {
    put([{ ingredientId: 'ing1', neededStamp: 100 }]);
    expect(() => put([{ ingredientId: 'ing1', neededStamp: 100 }, { ingredientId: 'nope', neededStamp: 100 }]))
      .toThrow(expect.objectContaining({ status: 404 }));
    expect(getAll()).toEqual([{ ingredientId: 'ing1', neededStamp: 100 }]); // прежний набор цел
  });

  it('neededStamp: null → 400 (а не 0 через Number(null))', () => {
    expect(() => put([{ ingredientId: 'ing1', neededStamp: null }]))
      .toThrow(expect.objectContaining({ status: 400 }));
    expect(getAll()).toEqual([]);
  });

  it('neededStamp: 0 ВАЛИДЕН (нулевая потребность: ключ <id>@0 из «взять всё»)', () => {
    // Аудит KB-15 (MAJOR A): backend принимает 0 (@PositiveOrZero), значит и mock
    // обязан: иначе в mock-режиме «взять всё» одним кликом валило весь PUT (400)
    // и dirty-флаг оставался навсегда.
    put([{ ingredientId: 'ing1', neededStamp: 0 }]);
    expect(getAll()).toEqual([{ ingredientId: 'ing1', neededStamp: 0 }]);
  });

  it('neededStamp: отрицательный/дробный/нечисловой/отсутствует → 400', () => {
    for (const neededStamp of [-5, 1.5, 'abc', undefined]) {
      expect(() => put([{ ingredientId: 'ing1', neededStamp }]))
        .toThrow(expect.objectContaining({ status: 400 }));
    }
    expect(() => put([{ neededStamp: 100 }]))
      .toThrow(expect.objectContaining({ status: 400 }));
  });

  it('items > 2000 → 400 (защита «полной замены»)', () => {
    const tooMany = Array.from({ length: 2001 }, (_, i) => ({
      ingredientId: 'ing1', neededStamp: 1000 + i,
    }));
    expect(() => put(tooMany)).toThrow(expect.objectContaining({ status: 400 }));
    expect(getAll()).toEqual([]);
  });

  it('items не массив → 400', () => {
    expect(() => req('PUT', `/trips/${TRIP}/checklist-bought`, { items: {} }))
      .toThrow(expect.objectContaining({ status: 400 }));
  });
});
