/**
 * Release-1.0 (UI-consistency): тесты ЕДИНОГО формата вывода чисел и единиц.
 * Контракт (см. format.ts):
 *  1. Итоговые суммы — целые рубли: «1 234 ₽» (неразрывный пробел, без копеек).
 *  2. Цены за единицу — ровно 2 знака, ЗАПЯТАЯ: «887,65».
 *  3. Количества — человеческая единица, адаптивная точность: «200 г», «1,5 кг», «8 шт».
 *  4. Категория продукта — всегда строка (объект ProductCategoryDto → name).
 */
import { describe, expect, it } from 'vitest';
import { formatRub, formatPrice, formatQty, unitShortLabel, categoryName } from './format';

// неразрывный пробел — разделитель тысяч в ru-RU
const NBSP = '\u00A0';

describe('formatRub — итоги целыми рублями', () => {
  it('округляет до целых и ставит неразрывный пробел', () => {
    expect(formatRub(1234)).toBe(`1${NBSP}234 ₽`);
    expect(formatRub(168)).toBe('168 ₽');
    expect(formatRub(494.71)).toBe('495 ₽');
  });

  it('скрин-баг «123,678 ₽»: три знака после запятой больше не протекают', () => {
    expect(formatRub(123.678)).toBe('124 ₽');
    expect(formatRub(123678.4)).toBe(`123${NBSP}678 ₽`);
  });

  it('принимает строки (цены с бэкенда приходят string)', () => {
    expect(formatRub('887.65')).toBe('888 ₽');
  });

  it('null/undefined/NaN → «—»', () => {
    expect(formatRub(null)).toBe('—');
    expect(formatRub(undefined)).toBe('—');
    expect(formatRub(NaN)).toBe('—');
    expect(formatRub('не число')).toBe('—');
  });

  it('-0 не печатается как «-0 ₽»', () => {
    expect(formatRub(-0.4)).toBe('0 ₽');
  });
});

describe('formatPrice — цена за единицу, 2 знака, запятая', () => {
  it('скрин-баг «9.86»: точка заменена запятой', () => {
    expect(formatPrice(9.86)).toBe('9,86');
    expect(formatPrice(887.6549)).toBe('887,65');
  });

  it('всегда ровно 2 знака', () => {
    expect(formatPrice(10)).toBe('10,00');
    expect(formatPrice(0.5)).toBe('0,50');
  });

  it('принимает строки и отдаёт «—» для пустых/NaN', () => {
    expect(formatPrice('9.86')).toBe('9,86');
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice(undefined)).toBe('—');
    expect(formatPrice(NaN)).toBe('—');
  });
});

describe('formatQty — количество с человеческой единицей', () => {
  it('KG: <1 → целые граммы, ≥1 → до 2 знаков через запятую', () => {
    expect(formatQty(0.8, 'KG')).toBe('800 г');
    expect(formatQty(0.25, 'KG')).toBe('250 г');
    expect(formatQty(1.5, 'KG')).toBe('1,5 кг');
    expect(formatQty(2, 'KG')).toBe('2 кг');
    expect(formatQty(1234.567, 'KG')).toBe(`1${NBSP}234,57 кг`);
  });

  it('L: <1 → миллилитры, ≥1 → литры', () => {
    expect(formatQty(0.25, 'L')).toBe('250 мл');
    expect(formatQty(2, 'L')).toBe('2 л');
    expect(formatQty(1.25, 'L')).toBe('1,25 л');
  });

  it('G/ML: целые', () => {
    expect(formatQty(150, 'G')).toBe('150 г');
    expect(formatQty(1.4, 'G')).toBe('1 г');
    expect(formatQty(30, 'ML')).toBe('30 мл');
  });

  it('PCS/PACK: целые штуки и упаковки', () => {
    expect(formatQty(8, 'PCS')).toBe('8 шт');
    expect(formatQty(5.6, 'PCS')).toBe('6 шт');
    expect(formatQty(2.2, 'PACK')).toBe('2 уп');
  });

  it('неизвестная единица сохраняется, число через запятую', () => {
    expect(formatQty(3.2, 'TLSP')).toBe('3,2 TLSP');
    expect(formatQty(3.2, null)).toBe('3,2');
  });

  it('null/NaN → «—»', () => {
    expect(formatQty(null, 'KG')).toBe('—');
    expect(formatQty(undefined, 'KG')).toBe('—');
    expect(formatQty(NaN, 'KG')).toBe('—');
  });
});

describe('unitShortLabel — короткая русская единица', () => {
  it('маппит коды единиц', () => {
    expect(unitShortLabel('KG')).toBe('кг');
    expect(unitShortLabel('G')).toBe('г');
    expect(unitShortLabel('L')).toBe('л');
    expect(unitShortLabel('ML')).toBe('мл');
    expect(unitShortLabel('PCS')).toBe('шт');
    expect(unitShortLabel('PACK')).toBe('уп');
  });

  it('пусто → «ед.», неизвестный код — как есть', () => {
    expect(unitShortLabel('')).toBe('ед.');
    expect(unitShortLabel(null)).toBe('ед.');
    expect(unitShortLabel(undefined)).toBe('ед.');
    expect(unitShortLabel('TLSP')).toBe('TLSP');
  });
});

describe('categoryName — категория всегда строкой', () => {
  it('скрин-баг «[object Object]»: объект ProductCategoryDto → name', () => {
    expect(categoryName({ category: { id: 3, name: 'Мясо', slug: 'meat', sortOrder: 1 } })).toBe('Мясо');
  });

  it('строка (mock/legacy) проходит без изменений', () => {
    expect(categoryName({ category: 'Мясо' })).toBe('Мясо');
    expect(categoryName({ categoryName: 'Крупы' })).toBe('Крупы');
  });

  it('categoryName в приоритете над category', () => {
    expect(categoryName({ categoryName: 'Крупы', category: { name: 'Мясо' } })).toBe('Крупы');
  });

  it('пустые/битые значения → пустая строка, прочее → String()', () => {
    expect(categoryName(null)).toBe('');
    expect(categoryName(undefined)).toBe('');
    expect(categoryName({})).toBe('');
    expect(categoryName({ category: null })).toBe('');
    expect(categoryName({ category: {} })).toBe('');
    expect(categoryName({ category: 42 })).toBe('42');
  });
});
