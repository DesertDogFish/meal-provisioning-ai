import { describe, it, expect } from 'vitest';
import { unitFromTotal, totalFromUnit, roundMoney } from './checkInput';

describe('checkInput (Fix-3, п.5) — сумма чека ↔ цена за единицу', () => {
  it('купил 2 кг гречки за 380 ₽ → 190 ₽/кг', () => {
    expect(unitFromTotal(380, 2)).toBeCloseTo(190);
  });

  it('купил чуть больше плана: 2,3 кг за 437 ₽ → 190 ₽/кг', () => {
    expect(unitFromTotal(437, 2.3)).toBeCloseTo(190);
  });

  it('round-trip: unit → total → unit', () => {
    const unit = unitFromTotal(500, 4)!;
    expect(totalFromUnit(unit, 4)).toBeCloseTo(500);
  });

  it('нулевое/отрицательное количество — null (не делим на ноль)', () => {
    expect(unitFromTotal(100, 0)).toBeNull();
    expect(unitFromTotal(100, -1)).toBeNull();
    expect(unitFromTotal(null, 2)).toBeNull();
  });

  it('totalFromUnit: null-юнит → null; количество 0 → 0', () => {
    expect(totalFromUnit(null, 2)).toBeNull();
    expect(totalFromUnit(190, 0)).toBe(0);
  });
});

describe('roundMoney (Fix-4, п.10) — никаких 165,50240000000002', () => {
  it('округляет до копеек', () => {
    expect(roundMoney(165.50240000000002)).toBe(165.5);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(380)).toBe(380);
  });

  it('null/NaN → null', () => {
    expect(roundMoney(null)).toBeNull();
    expect(roundMoney(NaN)).toBeNull();
    expect(roundMoney(undefined)).toBeNull();
  });
});
