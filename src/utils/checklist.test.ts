import { describe, it, expect } from 'vitest';
import { buildChecklist, toChecklistRow, OTHER_CATEGORY } from './checklist';

describe('checklist (U38) — закупка в упаковках', () => {
  it('«1 г соли» → пачка 1 кг (ceil), излишек виден', () => {
    const row = toChecklistRow(
      { ingredientId: 'ing12', ingredientName: 'Соль', unit: 'KG', totalAmount: 0.001 },
      { packSize: 1, roundToPacks: true, category: 'Специи' },
    );
    expect(row.packsToBuy).toBe(1);
    expect(row.buyAmount).toBe(1);
    expect(row.leftover).toBeCloseTo(0.999);
    expect(row.category).toBe('Специи');
  });

  it('2,3 кг при фасовке 0,9 кг → 3 упаковки (2,7 кг)', () => {
    const row = toChecklistRow(
      { ingredientId: 'i1', ingredientName: 'Гречка', unit: 'KG', totalAmount: 2.3 },
      { packSize: 0.9, roundToPacks: true },
    );
    expect(row.packsToBuy).toBe(3);
    expect(row.buyAmount).toBeCloseTo(2.7);
    expect(row.leftover).toBeCloseTo(0.4);
  });

  it('ровное количество упаковок — без излишка', () => {
    const row = toChecklistRow(
      { ingredientId: 'i1', ingredientName: 'Рис', unit: 'KG', totalAmount: 1.8 },
      { packSize: 0.9, roundToPacks: true },
    );
    expect(row.packsToBuy).toBe(2);
    expect(row.leftover).toBeCloseTo(0);
  });

  it('roundToPacks=false или нет packSize — «по потребности» (packsToBuy=null)', () => {
    const a = toChecklistRow(
      { ingredientId: 'i2', ingredientName: 'Тушёнка', unit: 'PCS', totalAmount: 9 },
      { packSize: 1, roundToPacks: false },
    );
    expect(a.packsToBuy).toBeNull();
    expect(a.buyAmount).toBe(9);
    const b = toChecklistRow(
      { ingredientId: 'i3', ingredientName: 'Вода', unit: 'L', totalAmount: 5 },
      null,
    );
    expect(b.packsToBuy).toBeNull();
    expect(b.buyAmount).toBe(5);
  });

  it('группы по категориям: алфавит, «Прочее» в конце, внутри — алфавит', () => {
    const groups = buildChecklist(
      [
        { ingredientId: 'i1', ingredientName: 'Тушёнка', unit: 'PCS', totalAmount: 3 },
        { ingredientId: 'i2', ingredientName: 'Гречка', unit: 'KG', totalAmount: 1.8 },
        { ingredientId: 'i3', ingredientName: 'Соль', unit: 'KG', totalAmount: 0.01 },
        { ingredientId: 'i4', ingredientName: 'Антисептик', unit: 'PCS', totalAmount: 1 },
      ],
      new Map([
        ['i1', { category: 'Консервы', packSize: 1, roundToPacks: true }],
        ['i2', { category: 'Крупы', packSize: 0.9, roundToPacks: true }],
        ['i3', { category: 'Специи', packSize: 1, roundToPacks: true }],
        // i4 — без информации: категория «Прочее»
      ]),
    );
    expect(groups.map(g => g.category)).toEqual(['Консервы', 'Крупы', 'Специи', OTHER_CATEGORY]);
    expect(groups[3].rows.map(r => r.name)).toEqual(['Антисептик']);
  });

  it('trip-scoped id сопоставляется с базовым id информации о фасовке', () => {
    const groups = buildChecklist(
      [{ ingredientId: 'ing12::ttrip1', ingredientName: 'Соль', unit: 'KG', totalAmount: 0.001 }],
      new Map([['ing12', { packSize: 1, roundToPacks: true, category: 'Специи' }]]),
    );
    expect(groups[0].rows[0].packsToBuy).toBe(1);
    expect(groups[0].category).toBe('Специи');
  });

  it('внутри категории — алфавитный порядок', () => {
    const groups = buildChecklist(
      [
        { ingredientId: 'i1', ingredientName: 'Ячка', unit: 'KG', totalAmount: 1 },
        { ingredientId: 'i2', ingredientName: 'Арахис', unit: 'KG', totalAmount: 1 },
        { ingredientId: 'i3', ingredientName: 'Манка', unit: 'KG', totalAmount: 1 },
      ],
      new Map([
        ['i1', { category: 'Крупы' }],
        ['i2', { category: 'Крупы' }],
        ['i3', { category: 'Крупы' }],
      ]),
    );
    expect(groups[0].rows.map(r => r.name)).toEqual(['Арахис', 'Манка', 'Ячка']);
  });
});
