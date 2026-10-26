import { describe, it, expect, vi } from 'vitest';
import { buildShoppingCsv, csvCell, downloadTextFile } from './checkExport';

describe('checkExport (R4-lite) — CSV закупки/чека', () => {
  it('csvCell экранирует ; кавычки и переводы строк', () => {
    expect(csvCell('Гречка')).toBe('Гречка');
    expect(csvCell('Соль; мелкая')).toBe('"Соль; мелкая"');
    expect(csvCell('Он сказал "да"')).toBe('"Он сказал ""да"""');
    expect(csvCell(null)).toBe('');
  });

  it('CSV: BOM, шапка, строки, CRLF', () => {
    const csv = buildShoppingCsv([
      { name: 'Гречка', amount: '2 кг', plannedCost: '400 ₽', actualCost: '380 ₽', delta: '-5%' },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Наименование;Количество;План, ₽;Факт, ₽;Δ, %');
    expect(lines[1]).toBe('Гречка;2 кг;400 ₽;380 ₽;-5%');
  });

  it('пустой список — только шапка', () => {
    const csv = buildShoppingCsv([]);
    expect(csv.slice(1).trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('downloadTextFile (R4-lite)', () => {
  it('создаёт blob-ссылку, кликает и освобождает URL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('zakupka.csv', 'a;b');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    click.mockRestore();
  });
});
