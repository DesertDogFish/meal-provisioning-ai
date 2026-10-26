import { describe, it, expect } from 'vitest';
import { tripReadiness } from './readiness';

describe('tripReadiness (Fix-3, п.2) — сквозной статус похода', () => {
  it('пустой поход: ничего не готово, чек вводить нельзя', () => {
    const r = tripReadiness({ mealsCount: 0, checklistTotal: 0, boughtCount: 0, factCount: 0 });
    expect(r).toMatchObject({ menu: 'none', shopping: 'none', checks: 'none', ready: false, canEnterCheck: false });
  });

  it('меню собрано, закупка не подтверждена — shopping none, чек заблокирован', () => {
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 0, factCount: 0 });
    expect(r.menu).toBe('done');
    expect(r.shopping).toBe('none');
    expect(r.canEnterCheck).toBe(false);
    expect(r.ready).toBe(false);
  });

  it('куплено частично — shopping partial, чек уже можно вводить (не блокер)', () => {
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 3, factCount: 0 });
    expect(r.shopping).toBe('partial');
    expect(r.canEnterCheck).toBe(true);
  });

  it('всё куплено + все цены введены — ready', () => {
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 12, factCount: 12 });
    expect(r).toMatchObject({ shopping: 'done', checks: 'done', ready: true });
  });

  it('цены введены частично — checks partial, не ready', () => {
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 12, factCount: 4 });
    expect(r.checks).toBe('partial');
    expect(r.ready).toBe(false);
  });
});

describe('tripReadiness — checksTotal (Fix-4, п.11)', () => {
  it('«введено X из Y»: done только когда оплачены ВСЕ позиции закупки', () => {
    // 12 позиций чеклиста, но в закупке (с ценами) — 10; введено 10 → done
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 12, factCount: 10, checksTotal: 10 });
    expect(r.checks).toBe('done');
    expect(r.ready).toBe(true);
  });

  it('введено меньше denominатора — partial, не ready', () => {
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 12, factCount: 57, checksTotal: 58 });
    expect(r.checks).toBe('partial');
    expect(r.ready).toBe(false);
  });

  it('без checksTotal знаменатель = checklistTotal (обратная совместимость)', () => {
    const r = tripReadiness({ mealsCount: 1, checklistTotal: 4, boughtCount: 4, factCount: 4 });
    expect(r.checks).toBe('done');
  });
});
