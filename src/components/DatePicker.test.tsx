/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 3, KB-32).
 *
 * Новый контракт (native <input type="date">, R2: слой изменения):
 *  - значение показывается в ISO YYYY-MM-DD (нативный формат браузера);
 *  - onChange вызывается при каждом изменении инпута;
 *  - min/max/disabled проксируются в нативный атрибут;
 *  - DateRange: endDate disabled пока startDate пуст, разблокируется при выборе.
 */
/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DatePicker } from './DatePicker';
import { DateRange } from './DateRange';

function input(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`input #${id} не найден`);
  return el as HTMLInputElement;
}

describe('DatePicker — отображение значения (KB-32, native input)', () => {
  it('значение формы в ISO YYYY-MM-DD', () => {
    render(<DatePicker value="2026-10-10" onChange={() => {}} id="d1" />);
    expect(input('d1').value).toBe('2026-10-10');
  });

  it('пустое значение → пустой инпут', () => {
    render(<DatePicker value={null} onChange={() => {}} id="d2" />);
    expect(input('d2').value).toBe('');
  });

  it('disabled пробрасывается', () => {
    render(<DatePicker value="2026-10-10" onChange={() => {}} id="d3" disabled />);
    expect(input('d3')).toBeDisabled();
  });

  it('min/max атрибуты проставляются', () => {
    render(<DatePicker value="2026-10-10" onChange={() => {}} id="d4" minDate={new Date('2026-01-01')} maxDate={new Date('2027-12-31')} />);
    expect(input('d4').getAttribute('min')).toBe('2026-01-01');
    expect(input('d4').getAttribute('max')).toBe('2027-12-31');
  });

  it('aria-describedby проставляется', () => {
    render(<DatePicker value="2026-10-10" onChange={() => {}} id="d5" describedBy="hint" />);
    expect(input('d5').getAttribute('aria-describedby')).toBe('hint');
  });
});

describe('DateRange — подсказка на заблокированном поле окончания (KB-32)', () => {
  it('endDate disabled + подпись при пустом startDate', () => {
    render(<DateRange startDate="" endDate="" onStartDateChange={() => {}} onEndDateChange={() => {}} />);
    expect(input('end-date')).toBeDisabled();
    const hint = screen.getByTestId('end-date-hint');
    expect(hint.textContent).toBe('Сначала укажите дату начала');
    expect(hint.style.visibility).toBe('visible');
    expect(input('end-date').getAttribute('aria-describedby')).toBe('end-date-hint');
  });

  it('после даты начала подсказка скрыта, поле разблокировано', () => {
    render(<DateRange startDate="2026-10-10" endDate="2026-10-12" onStartDateChange={() => {}} onEndDateChange={() => {}} />);
    expect(input('end-date')).not.toBeDisabled();
    expect(screen.getByTestId('end-date-hint').style.visibility).toBe('hidden');
    expect(input('end-date').getAttribute('aria-describedby')).toBeNull();
    // min остаётся ISO — контракт CR-3 (e2e проверяет атрибут)
    expect(input('end-date').getAttribute('min')).toBe('2026-10-10');
  });

  it('оба поля показывают ISO YYYY-MM-DD', () => {
    render(<DateRange startDate="2026-10-10" endDate="2026-10-12" onStartDateChange={() => {}} onEndDateChange={() => {}} />);
    expect(input('start-date').value).toBe('2026-10-10');
    expect(input('end-date').value).toBe('2026-10-12');
  });
});
