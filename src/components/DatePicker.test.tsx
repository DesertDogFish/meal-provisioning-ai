/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 3, KB-32).
 *
 * Контракт поля даты в живом компоненте (R2: слой изменения — компонент):
 *  - значение показывается в ДД.ММ.ГГГГ, а не ISO;
 *  - набранная с клавиатуры дата коммитится в форму (полная — сразу,
 *    короткая — на blur/Enter), нераспознанный ввод откатывается;
 *  - заблокированное поле окончания объясняет причину подписью.
 */
/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DatePicker } from './DatePicker';
import { DateRange } from './DateRange';

function input(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`input #${id} не найден`);
  return el as HTMLInputElement;
}

describe('DatePicker — отображение значения (KB-32)', () => {
  it('значение формы в ДД.ММ.ГГГГ, а не ISO 2026-10-10', () => {
    render(<DatePicker value="2026-10-10" onChange={() => {}} id="d1" />);
    expect(input('d1').value).toBe('10.10.2026');
    expect(input('d1').value).not.toContain('2026-10-10');
  });

  it('пустое значение → виден плейсхолдер ДД.ММ.ГГГГ', () => {
    render(<DatePicker value={null} onChange={() => {}} id="d2" />);
    expect(input('d2').value).toBe('');
    expect(input('d2').placeholder).toBe('ДД.ММ.ГГГГ');
  });
});

describe('DatePicker — коммит набранного с клавиатуры (KB-32)', () => {
  it('полная дата ДД.ММ.ГГГГ уходит в форму сразу (без blur)', () => {
    const onChange = vi.fn();
    render(<DatePicker value={null} onChange={onChange} id="d3" />);
    fireEvent.change(input('d3'), { target: { value: '10.11.2026' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-11-10');
  });

  it('ISO-ввод (вставка из буфера / e2e fill) тоже коммитится', () => {
    const onChange = vi.fn();
    render(<DatePicker value={null} onChange={onChange} id="d4" />);
    fireEvent.change(input('d4'), { target: { value: '2026-07-01' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-07-01');
  });

  it('короткая дата survives blur и уходит в форму', () => {
    const onChange = vi.fn();
    render(<DatePicker value={null} onChange={onChange} id="d5" />);
    fireEvent.change(input('d5'), { target: { value: '1.7.26' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input('d5'));
    expect(onChange).toHaveBeenLastCalledWith('2026-07-01');
  });

  it('Enter коммитит набранное и не открывает выбор календарём', () => {
    const onChange = vi.fn();
    render(<DatePicker value={null} onChange={onChange} id="d6" />);
    fireEvent.change(input('d6'), { target: { value: '5.3.27' } });
    fireEvent.keyDown(input('d6'), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('2027-03-05');
  });

  it('нераспознанный ввод на blur откатывается к значению формы', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-10-10" onChange={onChange} id="d7" />);
    fireEvent.change(input('d7'), { target: { value: '31.02.2026' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input('d7'));
    expect(onChange).not.toHaveBeenCalled();
    expect(input('d7').value).toBe('10.10.2026');
  });

  it('очистка поля отдаёт пустую строку', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-10-10" onChange={onChange} id="d8" />);
    fireEvent.change(input('d8'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

describe('DateRange — подсказка на заблокированном поле окончания (KB-32)', () => {
  it('endDate disabled + подпись «Сначала укажите дату начала» + aria-describedby', () => {
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

  it('оба поля показывают ДД.ММ.ГГГГ', () => {
    render(<DateRange startDate="2026-10-10" endDate="2026-10-12" onStartDateChange={() => {}} onEndDateChange={() => {}} />);
    expect(input('start-date').value).toBe('10.10.2026');
    expect(input('end-date').value).toBe('12.10.2026');
  });
});
