import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FreeAmountInput from './FreeAmountInput';
import type { ActualAmount } from '../utils/checkUnits';

describe('FreeAmountInput (Fix-6, п.8) — свободные единицы факта', () => {
  it('для KG показывает чипы «г» и «кг», по умолчанию — кг', () => {
    render(<FreeAmountInput value={null} baseUnit="KG" onChange={() => {}} ariaLabel="Факт" testId="fa" />);
    expect(screen.getByRole('button', { name: 'Единица: г' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Единица: кг' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Единица: кг' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('для PCS без веса штуки — только «шт»; с весом — ещё г/кг', () => {
    const { unmount } = render(<FreeAmountInput value={null} baseUnit="PCS" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Единица: шт' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Единица: г' })).toBeNull();
    unmount();
    render(<FreeAmountInput value={null} baseUnit="PCS" pieceWeightG={25} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Единица: г' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Единица: кг' })).toBeTruthy();
  });

  it('ввод «300» отдаёт {amount:300, unit} с выбранной единицей (запятая = точка)', () => {
    const onChange = vi.fn();
    render(<FreeAmountInput value={null} baseUnit="KG" onChange={onChange} testId="fa" />);
    fireEvent.change(screen.getByTestId('fa'), { target: { value: '0,3' } });
    expect(onChange).toHaveBeenLastCalledWith({ amount: 0.3, unit: 'кг' });
  });

  it('переключение единицы переэмитит текущее значение', () => {
    const onChange = vi.fn();
    render(<FreeAmountInput value={{ amount: 300, unit: 'г' } as ActualAmount} baseUnit="PCS" pieceWeightG={25} onChange={onChange} testId="fa" />);
    fireEvent.click(screen.getByRole('button', { name: 'Единица: шт' }));
    expect(onChange).toHaveBeenLastCalledWith({ amount: 300, unit: 'шт' });
  });

  it('пустое поле → null (сброс факта)', () => {
    const onChange = vi.fn();
    render(<FreeAmountInput value={{ amount: 2, unit: 'кг' }} baseUnit="KG" onChange={onChange} testId="fa" />);
    fireEvent.change(screen.getByTestId('fa'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('буквы не вводятся (фильтр нечисловых символов)', () => {
    const onChange = vi.fn();
    render(<FreeAmountInput value={null} baseUnit="KG" onChange={onChange} testId="fa" />);
    fireEvent.change(screen.getByTestId('fa'), { target: { value: 'abc' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FreeAmountInput — единый контур, плоский стык (Fix-7 п.13 + Fix-10 п.2)', () => {
  it('обёртка скруглена ЦЕЛИКОМ и скрывает переполнение; инпут — плоский (compact-input)', () => {
    render(<FreeAmountInput value={null} baseUnit="KG" onChange={() => {}} testId="fa-joint" />);
    const wrap = screen.getByTestId('fa-joint-wrap');
    // внешний контур: единый радиус (инлайн) + overflow-hidden (класс) —
    // левое скругление даёт обёртка
    expect(wrap.className).toContain('overflow-hidden');
    expect(wrap.style.borderRadius).toContain('var(--r-input');
    // инпут: compact-input (глобальный CSS Fix-10 п.2 обнуляет его собственный радиус —
    // справа вплотную примыкают кнопки единиц, «ступеньки» на стыке нет)
    const input = screen.getByTestId('fa-joint');
    expect(input.className).toContain('compact-input');
  });
});
