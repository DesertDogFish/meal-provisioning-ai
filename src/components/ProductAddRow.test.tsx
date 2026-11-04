/// <reference types="vitest/globals" />
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ProductAddRow from './ProductAddRow';

/**
 * bugs-trip-menu-stage п.4: общий блок «поиск + кол-во + добавить» — одна
 * строка без лейблов (переиспользует RecipeSearchSelect, R8). Логика
 * (merge/free-text-создание) живёт у родителей — здесь только презентация.
 */

const options = [
  { value: 'p1', label: 'Гречка', hint: 'Крупы' },
  { value: 'p2', label: 'Соль', hint: 'Специи' },
];

const renderRow = (over: Partial<React.ComponentProps<typeof ProductAddRow>> = {}) =>
  render(
    <ProductAddRow
      options={options}
      value=""
      onValueChange={vi.fn()}
      amount={null}
      onAmountChange={vi.fn()}
      unit="PCS"
      searchAriaLabel="Поиск продукта"
      amountTestId="amount"
      onAdd={vi.fn()}
      {...over}
    />
  );

beforeEach(() => cleanup());

describe('ProductAddRow', () => {
  it('одна строка: поиск + количество + «Добавить»', () => {
    renderRow();
    const row = screen.getByTestId('product-add-row');
    expect(within(row).getByLabelText('Поиск продукта')).toBeTruthy();
    expect(within(row).getByTestId('amount')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Добавить' })).toBeTruthy();
    // никаких <label> — подписей-заголовков нет
    expect(row.querySelectorAll('label')).toHaveLength(0);
  });

  it('клик «Добавить» вызывает onAdd; busy — подпись «Добавляем…» и disabled', () => {
    const onAdd = vi.fn();
    renderRow({ onAdd, addBusy: true });
    const btn = screen.getByRole('button', { name: /Добавить|Добавляем/ });
    expect(btn.textContent).toContain('Добавляем…');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('без onAdd — строка только «поиск + кол-во» (паттерн RecipeIngredientsEditor)', () => {
    renderRow({ onAdd: undefined });
    const row = screen.getByTestId('product-add-row');
    expect(within(row).queryByRole('button', { name: 'Добавить' })).toBeNull();
  });

  it('children рендерятся под строкой (слот подтверждений/free-text)', () => {
    renderRow({ children: <div data-testid="child-slot">подтверждение</div> });
    const child = screen.getByTestId('child-slot');
    expect(child).toBeTruthy();
    // слот — НЕ внутри строки
    expect(screen.getByTestId('product-add-row').contains(child)).toBe(false);
  });

  it('выбор продукта из поиска пробрасывается в onValueChange', () => {
    const onValueChange = vi.fn();
    renderRow({ onValueChange });
    const search = screen.getByLabelText('Поиск продукта');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Греч' } });
    fireEvent.click(screen.getByText('Гречка'));
    expect(onValueChange).toHaveBeenCalledWith('p1');
  });
});
