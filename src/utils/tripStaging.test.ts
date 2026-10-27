/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach } from 'vitest';
import {
  neededStamp, factIsFresh,
  loadActualPrices, saveActualPrice,
  loadActualQty, setActualQty,
} from './tripStaging';

/**
 * Fix-7 (п.17): «если я менял состав или количество чего-то в походе, то чек
 * должен тоже скинуться на эти позиции» — факты (цена чека и «Взяли») штампуются
 * потребностью позиции (neededAt); при несовпадении потребности факт считается
 * устаревшим и игнорируется (позицию надо переввести).
 */
describe('tripStaging — свежесть фактов (Fix-7 п.17)', () => {
  beforeEach(() => localStorage.clear());

  it('neededStamp — штамп потребности с точностью до граммов', () => {
    expect(neededStamp(0.072)).toBe(72);
    expect(neededStamp(1.5)).toBe(1500);
    expect(neededStamp(0)).toBe(0);
    expect(neededStamp(null)).toBe(0);
    expect(neededStamp(undefined)).toBe(0);
  });

  it('factIsFresh: нет факта → false; legacy без штампа → true; штамп совпал → true; разошёлся → false', () => {
    expect(factIsFresh(null, 1)).toBe(false);
    expect(factIsFresh(undefined, 1)).toBe(false);
    // legacy-запись (введена до Fix-7, без neededAt) — считается валидной,
    // чтобы обновление не стирало уже введённые чеки
    expect(factIsFresh({ price: 10, total: 10 }, 0.5)).toBe(true);
    expect(factIsFresh({ neededAt: 500 }, 0.5)).toBe(true);
    expect(factIsFresh({ neededAt: 500 }, 0.6)).toBe(false);
    // точность до граммов: 0.072 → 72
    expect(factIsFresh({ neededAt: neededStamp(0.072) }, 0.072)).toBe(true);
    expect(factIsFresh({ neededAt: neededStamp(0.072) }, 0.073)).toBe(false);
  });

  it('факт цены чека сохраняется и читается вместе с neededAt', () => {
    saveActualPrice('t7', '42', { price: 100, total: 500, neededAt: neededStamp(5) });
    const loaded = loadActualPrices('t7')['42'];
    expect(loaded.price).toBe(100);
    expect(loaded.total).toBe(500);
    expect(loaded.neededAt).toBe(5000);
    expect(factIsFresh(loaded, 5)).toBe(true);
    expect(factIsFresh(loaded, 6)).toBe(false);
  });

  it('факт «Взяли» сохраняется и читается вместе с neededAt', () => {
    setActualQty('t7', '42', { amount: 3, unit: 'шт', neededAt: neededStamp(5) });
    const q = loadActualQty('t7')['42'];
    expect(q).toEqual({ amount: 3, unit: 'шт', neededAt: 5000 });
    expect(factIsFresh(q, 5)).toBe(true);
  });

  it('setActualQty(null) стирает факт', () => {
    setActualQty('t7', '42', { amount: 3, unit: 'шт', neededAt: 1 });
    setActualQty('t7', '42', null);
    expect(loadActualQty('t7')['42']).toBeUndefined();
  });
});
