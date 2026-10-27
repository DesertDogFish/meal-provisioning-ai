/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach } from 'vitest';
import {
  neededStamp, factIsFresh,
  loadActualPrices, saveActualPrice,
  loadActualQty, setActualQty,
} from './tripStaging';

/**
 * Fix-8 (п.6): «если я поменял количество человек в походе, это не значит,
 * что надо удалять все значения, которые я вводил по закупкам».
 *
 * Факты (цена чека и «Взяли») — пользовательский ввод — переживают изменение
 * потребности позиции (число людей / состав). Хранилище никогда не аннулирует
 * их по neededAt; цена за единицу применяется к текущему «нужно», суммы
 * пересчитываются потребителями автоматически.
 *
 * neededStamp/factIsFresh сохранены как DEPRECATED-утилиты (legacy-записи
 * Fix-7 в localStorage всё ещё содержат neededAt) и здесь тестируются как
 * чистые функции — UI их больше не использует как gating.
 */
describe('tripStaging — факты закупки переживают смену потребности (Fix-8 п.6)', () => {
  beforeEach(() => localStorage.clear());

  it('цена чека не аннулируется, когда «нужно» изменилось (смена числа людей)', () => {
    // ввели чек при потребности 5 кг (legacy-запись могла содержать neededAt)
    saveActualPrice('t8', '42', { price: 100, total: 500, neededAt: neededStamp(5) });
    // потребность стала 6 кг — запись ОБЯЗАНА остаться как есть
    const loaded = loadActualPrices('t8')['42'];
    expect(loaded.price).toBe(100);
    expect(loaded.total).toBe(500);
    // потребитель пересчитает сумму от текущего «нужно»: 100 ₽/кг × 6 кг
    expect(loaded.price * 6).toBe(600);
  });

  it('новая запись цены сохраняется без neededAt (штамп больше не пишется)', () => {
    saveActualPrice('t8', '7', { price: 42, total: 84 });
    const loaded = loadActualPrices('t8')['7'];
    expect(loaded.price).toBe(42);
    expect(loaded.neededAt).toBeUndefined();
  });

  it('«Взяли» не аннулируется, когда «нужно» изменилось', () => {
    setActualQty('t8', '42', { amount: 3, unit: 'шт', neededAt: neededStamp(5) });
    // потребность изменилась — факт на месте
    const q = loadActualQty('t8')['42'];
    expect(q.amount).toBe(3);
    expect(q.unit).toBe('шт');
  });

  it('setActualQty(null) стирает факт (явное удаление пользователем)', () => {
    setActualQty('t8', '42', { amount: 3, unit: 'шт' });
    setActualQty('t8', '42', null);
    expect(loadActualQty('t8')['42']).toBeUndefined();
  });

  it('saveActualPrice(null) стирает цену (явное удаление пользователем)', () => {
    saveActualPrice('t8', '42', { price: 100, total: 500 });
    saveActualPrice('t8', '42', null);
    expect(loadActualPrices('t8')['42']).toBeUndefined();
  });
});

describe('tripStaging — DEPRECATED-утилиты Fix-7 (чистые функции, UI не использует)', () => {
  it('neededStamp — штамп потребности с точностью до граммов', () => {
    expect(neededStamp(0.072)).toBe(72);
    expect(neededStamp(1.5)).toBe(1500);
    expect(neededStamp(0)).toBe(0);
    expect(neededStamp(null)).toBe(0);
    expect(neededStamp(undefined)).toBe(0);
  });

  it('factIsFresh: нет факта → false; без штампа → true; штамп совпал → true; разошёлся → false', () => {
    expect(factIsFresh(null, 1)).toBe(false);
    expect(factIsFresh(undefined, 1)).toBe(false);
    expect(factIsFresh({ price: 10, total: 10 }, 0.5)).toBe(true);
    expect(factIsFresh({ neededAt: 500 }, 0.5)).toBe(true);
    expect(factIsFresh({ neededAt: 500 }, 0.6)).toBe(false);
    expect(factIsFresh({ neededAt: neededStamp(0.072) }, 0.072)).toBe(true);
    expect(factIsFresh({ neededAt: neededStamp(0.072) }, 0.073)).toBe(false);
  });
});
