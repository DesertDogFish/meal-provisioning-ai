/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WhoOwesBlock } from './WhoOwesBlock';

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5/п.9): «Кто сколько
 * должен» — один компонент на этап ④ (variant 'stage') и отчёт (variant
 * 'report'). Формула: факт-сумма ÷ реальное число людей (AGENTS §12 —
 * без дополнительных пересчётов денег на клиенте).
 */
describe('WhoOwesBlock', () => {
  it('stage: поровну = факт ÷ люди, подсказка с формулой, строки по дням', () => {
    render(
      <WhoOwesBlock
        totalActual={3000}
        realPeople={4}
        days={[
          { dayDate: '2026-07-01', people: 4, actualCost: 2000 },
          { dayDate: '2026-07-02', people: 2, actualCost: 1000 },
        ]}
      />
    );
    const block = screen.getByTestId('who-owes');
    expect(block.textContent).toContain('Кто сколько должен');
    // поровну: 3000 / 4 = 750 ₽
    expect(block.textContent).toContain('750');
    // дни: 2000/4 = 500 ₽/чел, 1000/2 = 500 ₽/чел
    const rows = block.querySelectorAll('.who-owes__row');
    expect(rows.length).toBe(3); // поровну + 2 дня
    expect(rows[1].textContent).toContain('500');
    expect(rows[2].textContent).toContain('500');
  });

  it('report: участники 1..N (N = round(людей)), сумма = факт ÷ люди', () => {
    render(<WhoOwesBlock variant="report" totalActual={900} realPeople={2.5} />);
    const block = screen.getByTestId('report-owe');
    expect(block.textContent).toContain('Итог: поровну');
    const rows = block.querySelectorAll('.who-owes__row');
    expect(rows.length).toBe(3); // round(2.5) = 3 участника (округление вверх по смыслу отчёта)
    // 900 / 2.5 = 360 ₽ на каждого
    for (const r of rows) expect(r.textContent).toContain('360');
    expect(block.textContent).toContain('Участник 1');
    expect(block.textContent).toContain('Участник 3');
  });

  it('деление на ноль защищено: realPeople=0 → делитель 1', () => {
    render(<WhoOwesBlock variant="report" totalActual={500} realPeople={0} />);
    const block = screen.getByTestId('report-owe');
    expect(block.querySelectorAll('.who-owes__row').length).toBe(1); // max(1, round(0))
    expect(block.textContent).toContain('500');
  });
});
