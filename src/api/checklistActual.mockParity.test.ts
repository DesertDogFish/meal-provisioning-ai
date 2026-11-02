/**
 * BL-27 (mock-паритет): GET/PUT /trips/{id}/checklist-actual-qty должны вести себя
 * ровно как backend ChecklistActualQty:
 *   GET -> [{ingredientId, amount, unit}];
 *   PUT {items:[...]} -> идемпотентная ПОЛНАЯ замена набора, ответ = сохранённый набор;
 *   дубли ingredientId схлопываются (последнее значение выигрывает);
 *   неизвестный продукт -> 404 (набор НЕ меняется);
 *   кривая пара (amount <= 0, пустая/слишком длинная unit) -> 400;
 *   неизвестный/чужой поход -> 404.
 *
 * Факт количества — «сколько реально берём/взяли» ({amount, unit}) и, в отличие от
 * отметок «взято», привязан к ПОЗИЦИИ, а не к штампу потребности: переживает пересчёт
 * числа людей (Fix-8 п.6).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockServer } from './mockServer';
import { checklistActualQty } from './mockState';

const TRIP = 'trip1';
const req = <T>(method: string, path: string, body?: unknown): T =>
  mockServer.handleRequest<T>(method, path, body);
const put = (items: unknown) => req('PUT', `/trips/${TRIP}/checklist-actual-qty`, { items });
const getAll = () => req<any[]>('GET', `/trips/${TRIP}/checklist-actual-qty`);

describe('CONTRACT BL-27: /trips/:id/checklist-actual-qty (mock ≡ backend)', () => {
  beforeEach(() => { delete checklistActualQty[TRIP]; });

  it('GET пустого набора — []', () => {
    expect(getAll()).toEqual([]);
  });

  it('PUT — полная замена, GET отдаёт ту же форму [{ingredientId, amount, unit}]', () => {
    const saved = put([
      { ingredientId: 'ing1', amount: 300, unit: 'г' },
      { ingredientId: 'ing2', amount: 2, unit: 'кг' },
    ]);
    expect(saved).toEqual([
      { ingredientId: 'ing1', amount: 300, unit: 'г' },
      { ingredientId: 'ing2', amount: 2, unit: 'кг' },
    ]);
    expect(getAll()).toEqual(saved);
  });

  it('PUT идемпотентен: повторный набор ЗАМЕНЯЕТ прежний (а не дополняет)', () => {
    put([{ ingredientId: 'ing1', amount: 300, unit: 'г' }]);
    put([{ ingredientId: 'ing2', amount: 5, unit: 'шт' }]);
    expect(getAll()).toEqual([{ ingredientId: 'ing2', amount: 5, unit: 'шт' }]);
    // пустой набор — валидная замена («стереть факты»)
    put([]);
    expect(getAll()).toEqual([]);
  });

  it('дубли ingredientId схлопываются: последнее значение выигрывает', () => {
    put([
      { ingredientId: 'ing1', amount: 300, unit: 'г' },
      { ingredientId: 'ing1', amount: 500, unit: 'г' },
    ]);
    expect(getAll()).toEqual([{ ingredientId: 'ing1', amount: 500, unit: 'г' }]);
  });

  it('unit обрезается по краям (trim) — как сервер', () => {
    put([{ ingredientId: 'ing1', amount: 1, unit: '  кг  ' }]);
    expect(getAll()).toEqual([{ ingredientId: 'ing1', amount: 1, unit: 'кг' }]);
  });

  it('PUT без items → 400; неизвестный поход → 404', () => {
    expect(() => req('PUT', `/trips/${TRIP}/checklist-actual-qty`, {}))
      .toThrow(expect.objectContaining({ status: 400 }));
    expect(() => req('GET', '/trips/nope/checklist-actual-qty'))
      .toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('CONTRACT BL-27: серверная валидация набора фактов (404/400)', () => {
  beforeEach(() => { delete checklistActualQty[TRIP]; });

  it('неизвестный ingredientId → 404 и набор НЕ меняется', () => {
    put([{ ingredientId: 'ing1', amount: 300, unit: 'г' }]);
    expect(() => put([
      { ingredientId: 'ing1', amount: 300, unit: 'г' },
      { ingredientId: 'nope', amount: 1, unit: 'кг' },
    ])).toThrow(expect.objectContaining({ status: 404 }));
    expect(getAll()).toEqual([{ ingredientId: 'ing1', amount: 300, unit: 'г' }]); // прежний набор цел
  });

  it('amount <= 0 / null / NaN / отсутствует → 400', () => {
    for (const amount of [0, -5, null, 'abc', undefined]) {
      expect(() => put([{ ingredientId: 'ing1', amount, unit: 'г' }]))
        .toThrow(expect.objectContaining({ status: 400 }));
    }
    expect(getAll()).toEqual([]);
  });

  it('unit пустой/пробельный/длиннее 16 → 400', () => {
    for (const unit of ['', '   ', 'x'.repeat(17), null, 42]) {
      expect(() => put([{ ingredientId: 'ing1', amount: 1, unit }]))
        .toThrow(expect.objectContaining({ status: 400 }));
    }
    expect(getAll()).toEqual([]);
  });

  it('дробный amount валиден (2.5 кг)', () => {
    put([{ ingredientId: 'ing1', amount: 2.5, unit: 'кг' }]);
    expect(getAll()).toEqual([{ ingredientId: 'ing1', amount: 2.5, unit: 'кг' }]);
  });

  it('items > 2000 → 400 (защита «полной замены»)', () => {
    const tooMany = Array.from({ length: 2001 }, (_, i) => ({
      ingredientId: 'ing1', amount: 1 + i, unit: 'г',
    }));
    expect(() => put(tooMany)).toThrow(expect.objectContaining({ status: 400 }));
    expect(getAll()).toEqual([]);
  });

  it('items не массив → 400', () => {
    expect(() => req('PUT', `/trips/${TRIP}/checklist-actual-qty`, { items: {} }))
      .toThrow(expect.objectContaining({ status: 400 }));
  });
});
