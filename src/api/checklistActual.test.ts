/**
 * BL-27: клиент серверного факта количества — нормализация id и защита PUT.
 *
 * PUT здесь «полная замена», поэтому цена ошибки высока: одна невалидная пара
 * валит весь запрос (400), а пустая отправка стёрла бы ВСЕ серверные факты.
 * Отсюда два инварианта, которые и проверяются:
 *  1) неотправляемые пары отсеиваются локально и возвращаются в `rejected`;
 *  2) «нечего отправлять» → PUT вообще не выполняется (иначе — потеря данных).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

import { api } from './client';
import {
  baseIngredientKey,
  getServerActualQty,
  syncServerActualQty,
  toServerIngredientId,
} from './checklistActual';

const TRIP = 't1';
const putMock = vi.mocked(api.put);
const getMock = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
  putMock.mockResolvedValue([] as never);
});

describe('BL-27: нормализация id для сервера', () => {
  it('числовые id уходят числом, строковые — строкой', () => {
    expect(toServerIngredientId('42')).toBe(42);
    expect(toServerIngredientId('ing5')).toBe('ing5');
  });

  it('trip-scoped суффикс срезается, пустое значение → null', () => {
    expect(toServerIngredientId('ing5::ttrip1')).toBe('ing5');
    expect(toServerIngredientId('   ')).toBeNull();
    expect(toServerIngredientId('')).toBeNull();
  });

  it('baseIngredientKey: базовый id локального ключа', () => {
    expect(baseIngredientKey('ing5::ttrip1')).toBe('ing5');
    expect(baseIngredientKey('ing5')).toBe('ing5');
  });
});

describe('BL-27: чтение серверного набора', () => {
  it('валидные пары возвращаются нормализованными (unit trim, amount → number)', async () => {
    getMock.mockResolvedValue([
      { ingredientId: 'ing1', amount: '300', unit: ' г ' },
      { ingredientId: 7, amount: 2, unit: 'кг' },
    ] as never);

    await expect(getServerActualQty(TRIP)).resolves.toEqual([
      { ingredientId: 'ing1', amount: 300, unit: 'г' },
      { ingredientId: 7, amount: 2, unit: 'кг' },
    ]);
    expect(getMock).toHaveBeenCalledWith(`/trips/${TRIP}/checklist-actual-qty`);
  });

  it('мусорные элементы отбрасываются (amount <= 0, пустой unit, null)', async () => {
    getMock.mockResolvedValue([
      null,
      { ingredientId: 'ing1', amount: 0, unit: 'г' },
      { ingredientId: 'ing2', amount: -1, unit: 'г' },
      { ingredientId: 'ing3', amount: 1, unit: '  ' },
      { amount: 1, unit: 'г' },
      { ingredientId: 'ing4', amount: 5, unit: 'шт' },
    ] as never);

    await expect(getServerActualQty(TRIP)).resolves.toEqual([
      { ingredientId: 'ing4', amount: 5, unit: 'шт' },
    ]);
  });

  it('ошибка сети / не массив → null (недоступность ≠ пустой набор)', async () => {
    getMock.mockRejectedValueOnce(new Error('offline'));
    await expect(getServerActualQty(TRIP)).resolves.toBeNull();

    getMock.mockResolvedValueOnce({ items: [] } as never);
    await expect(getServerActualQty(TRIP)).resolves.toBeNull();
  });
});

describe('BL-27: отправка набора (полная замена)', () => {
  it('валидные пары уходят одним PUT, ответ ok', async () => {
    const res = await syncServerActualQty(TRIP, {
      ing1: { amount: 300, unit: 'г' },
      'ing2::ttrip1': { amount: 2, unit: 'кг' },
    });

    expect(res).toEqual({ ok: true, sent: 2, rejected: [] });
    expect(putMock).toHaveBeenCalledWith(`/trips/${TRIP}/checklist-actual-qty`, {
      items: [
        { ingredientId: 'ing1', amount: 300, unit: 'г' },
        { ingredientId: 'ing2', amount: 2, unit: 'кг' },
      ],
    });
  });

  it('пустая карта — валидная очистка (PUT с пустым items)', async () => {
    const res = await syncServerActualQty(TRIP, {});
    expect(res).toEqual({ ok: true, sent: 0, rejected: [] });
    expect(putMock).toHaveBeenCalledWith(`/trips/${TRIP}/checklist-actual-qty`, { items: [] });
  });

  it('невалидные пары отсеиваются в rejected и не валят запрос', async () => {
    const res = await syncServerActualQty(TRIP, {
      ing1: { amount: 1, unit: 'кг' },
      ing2: { amount: 0, unit: 'кг' },
      ing3: { amount: 1, unit: '' },
      ing4: { amount: 1, unit: 'x'.repeat(17) },
    });

    expect(res).toEqual({ ok: true, sent: 1, rejected: ['ing2', 'ing3', 'ing4'] });
    expect(putMock).toHaveBeenCalledWith(`/trips/${TRIP}/checklist-actual-qty`, {
      items: [{ ingredientId: 'ing1', amount: 1, unit: 'кг' }],
    });
  });

  it('в карте ТОЛЬКО невалидные пары → PUT не выполняется (иначе стёрли бы сервер)', async () => {
    const res = await syncServerActualQty(TRIP, { ing2: { amount: 0, unit: 'кг' } });

    expect(res).toEqual({ ok: false, sent: 0, rejected: ['ing2'] });
    expect(putMock).not.toHaveBeenCalled();
  });

  it('ошибка сервера → ok:false, без исключения (офлайн-буфер досылает позже)', async () => {
    putMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 409 }));
    const res = await syncServerActualQty(TRIP, { ing1: { amount: 1, unit: 'кг' } });

    expect(res.ok).toBe(false);
    expect(res.sent).toBe(0);
  });
});
