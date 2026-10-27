/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { computeDropdownPosition } from './dropdownPos';

const vp = { width: 1280, height: 800 };

describe('computeDropdownPosition (Fix-7 п.12/14: дропдаун в портале)', () => {
  it('открывается вниз под триггером, minWidth = ширина триггера', () => {
    const pos = computeDropdownPosition({ top: 100, bottom: 136, left: 200, width: 150 }, vp);
    expect(pos.openUp).toBe(false);
    expect(pos.top).toBe(140); // bottom + gap(4)
    expect(pos.left).toBe(200);
    expect(pos.minWidth).toBe(150);
    expect(pos.maxHeight).toBeLessThanOrEqual(280);
  });

  it('у нижнего края вьюпорта — открывается вверх', () => {
    const pos = computeDropdownPosition({ top: 740, bottom: 776, left: 200, width: 150 }, vp);
    expect(pos.openUp).toBe(true);
    // список целиком выше триггера и не вылезает за верхний край
    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(740);
    expect(pos.top).toBeGreaterThanOrEqual(8);
  });

  it('maxHeight ограничен доступным местом внизу', () => {
    const pos = computeDropdownPosition({ top: 500, bottom: 536, left: 10, width: 100 }, vp);
    // доступно 800-536-4-8=252 → maxHeight = min(280, 252)
    expect(pos.maxHeight).toBe(252);
    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(800 - 8);
  });

  it('left не вылезает за правый край вьюпорта', () => {
    const pos = computeDropdownPosition({ top: 100, bottom: 136, left: 1250, width: 150 }, vp);
    expect(pos.left + pos.maxWidth).toBeLessThanOrEqual(1280 - 8);
  });

  it('left не уходит за левый край', () => {
    const pos = computeDropdownPosition({ top: 100, bottom: 136, left: 2, width: 150 }, vp);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  it('maxWidth — не уже триггера; на широком вьюпорте — кэп 360', () => {
    // триггер шире вьюпорта — список не может быть УЖЕ триггера (minWidth=maxWidth=900)
    const narrow = computeDropdownPosition({ top: 10, bottom: 40, left: 10, width: 900 }, { width: 400, height: 800 });
    expect(narrow.maxWidth).toBe(900);
    expect(narrow.minWidth).toBe(900);
    const wide = computeDropdownPosition({ top: 10, bottom: 40, left: 10, width: 100 }, vp);
    expect(wide.maxWidth).toBe(360); // дефолтный кэп
    expect(wide.minWidth).toBe(100);
  });

  it('настройки gap/margin/listHeight/maxWidth учитываются', () => {
    const pos = computeDropdownPosition(
      { top: 100, bottom: 136, left: 200, width: 150 },
      vp,
      { gap: 10, margin: 20, listHeight: 120, maxWidth: 500 },
    );
    expect(pos.top).toBe(146); // bottom + gap 10
    expect(pos.maxHeight).toBe(120);
    expect(pos.maxWidth).toBe(500);
  });
});
