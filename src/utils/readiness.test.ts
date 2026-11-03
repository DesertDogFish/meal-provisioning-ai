import { describe, it, expect } from 'vitest';
import { tripReadiness, earliestOpenStage , workflowProgress, workflowProgressFill } from './readiness';

describe('tripReadiness (Fix-3, п.2) — сквозной статус похода', () => {
  it('пустой поход: ничего не готово, чек вводить нельзя', () => {
    const r = tripReadiness({ mealsCount: 0, checklistTotal: 0, boughtCount: 0, factCount: 0 });
    expect(r).toMatchObject({ menu: 'none', store: 'none', checks: 'none', ready: false, canEnterCheck: false });
  });

  it('меню собрано, закупка не подтверждена — store none, чек заблокирован', () => {
    // redesign п.4: menu done = утверждение меню (фикстура обновлена 03.11.2026)
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 0, factCount: 0, menuApproved: true });
    expect(r.menu).toBe('done');
    expect(r.store).toBe('none');
    expect(r.canEnterCheck).toBe(false);
    expect(r.ready).toBe(false);
  });

  it('куплено частично — store partial, чек уже можно вводить (не блокер)', () => {
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 3, factCount: 0 });
    expect(r.store).toBe('partial');
    expect(r.canEnterCheck).toBe(true);
  });

  it('всё куплено + все цены введены — ready', () => {
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 12, factCount: 12, menuApproved: true });
    expect(r).toMatchObject({ store: 'done', checks: 'done', ready: true });
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
    const r = tripReadiness({ mealsCount: 5, checklistTotal: 12, boughtCount: 12, factCount: 10, checksTotal: 10, menuApproved: true });
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

describe('earliestOpenStage (bugs-trip-list п.3) — этап по самой ранней незакрытой части', () => {
  const r = (f: Parameters<typeof tripReadiness>[0]) => tripReadiness(f);

  it('меню не собрано → «menu» (даже если чеки уже введены)', () => {
    expect(earliestOpenStage(r({ mealsCount: 0, checklistTotal: 5, boughtCount: 5, factCount: 5 }), { checklistTotal: 5 }))
      .toBe('menu');
  });

  it('меню собрано, чеклист пуст → «shopping» (этап ②)', () => {
    expect(earliestOpenStage(r({ mealsCount: 2, checklistTotal: 0, boughtCount: 0, factCount: 0, menuApproved: true }), { checklistTotal: 0 }))
      .toBe('shopping');
  });

  it('закупка не закрыта (ничего не взято / частично) → «store», даже при введённых чеках', () => {
    expect(earliestOpenStage(r({ mealsCount: 2, checklistTotal: 4, boughtCount: 0, factCount: 4, checksTotal: 4, menuApproved: true }), { checklistTotal: 4 }))
      .toBe('store');
    expect(earliestOpenStage(r({ mealsCount: 2, checklistTotal: 4, boughtCount: 1, factCount: 4, checksTotal: 4, menuApproved: true }), { checklistTotal: 4 }))
      .toBe('store');
  });

  it('всё взято, чеки не до конца → «checks»', () => {
    expect(earliestOpenStage(r({ mealsCount: 2, checklistTotal: 4, boughtCount: 4, factCount: 2, menuApproved: true }), { checklistTotal: 4 }))
      .toBe('checks');
  });

  it('поход готов → «ready» (redesign п.5: финальный этап ⑤)', () => {
    expect(earliestOpenStage(r({ mealsCount: 2, checklistTotal: 4, boughtCount: 4, factCount: 4, menuApproved: true }), { checklistTotal: 4 }))
      .toBe('ready');
  });
});

// trip-workflow-redesign п.4: done.menu = утверждение меню; прогресс — 5 сегментов.
describe('readiness — redesign п.4: утверждение меню и сегменты прогресса', () => {
  it('меню не утверждено → menu НЕ done, даже если блюда есть', () => {
    const r = tripReadiness({ mealsCount: 3, checklistTotal: 0, boughtCount: 0, factCount: 0, menuApproved: false });
    expect(r.menu).not.toBe('done');
    expect(r.menu).toBe('partial');
    expect(r.ready).toBe(false);
  });

  it('утверждено + блюда есть → menu done; ready требует утверждения', () => {
    const r = tripReadiness({
      mealsCount: 3, checklistTotal: 2, boughtCount: 2, factCount: 2, menuApproved: true,
    });
    expect(r.menu).toBe('done');
    expect(r.ready).toBe(true);
  });

  it('10 блюд → сегмент ① заполнен, полоса = 20% (1 из 5 равных сегментов)', () => {
    const f = { mealsCount: 10, checklistTotal: 0, boughtCount: 0, factCount: 0, menuApproved: true };
    const segs = workflowProgress(tripReadiness(f), f);
    expect(segs).toHaveLength(5);
    expect(segs[0].fill).toBe(1);
    expect(workflowProgressFill(segs)).toBeCloseTo(0.2, 5);
  });

  it('1 блюдо → сегмент ① = 1/10 → полоса 2%; сегмент ② = позиции есть/нет', () => {
    const f = { mealsCount: 1, checklistTotal: 4, boughtCount: 0, factCount: 0, menuApproved: true };
    const segs = workflowProgress(tripReadiness(f), f);
    expect(segs[0].fill).toBeCloseTo(0.1, 5);
    expect(segs[1].fill).toBe(1);
    expect(workflowProgressFill(segs)).toBeCloseTo((0.1 + 1) / 5, 5);
  });
});
