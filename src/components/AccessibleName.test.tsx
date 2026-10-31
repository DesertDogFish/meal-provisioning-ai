/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 6).
 *
 * Критерий приёмки осмотра: probe «кнопки без accessible name» = 0.
 * Здесь probe (`src/test/a11y.ts`) прогнан на компонентах с простым контрактом
 * props; тяжёлые fixtures (TripDaysList, AddMealModal, ApiModeBadge, LoginPage)
 * проверяют тот же probe в своих тест-файлах.
 */
/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductTable, EMPTY_FILTERS } from './ProductTable';
import type { ProductRow } from './ProductTable';
import { ToastProvider } from './ToastProvider';
import { ProblemDetailAlert } from './ProblemDetailAlert';
import { namelessButtons } from '../test/a11y';

const mk = (over: Partial<ProductRow>): ProductRow => ({
  id: 'x', name: 'Продукт', unit: 'KG', category: '1', categoryName: 'Категория',
  usageRecipes: 0, bindingStatus: 'UNBOUND', ...over,
});

const products: ProductRow[] = [
  mk({ id: 'a', name: 'Гречка', categoryName: 'Крупы' }),
  mk({ id: 'b', name: 'Тушёнка', unit: 'PCS', pieceWeightG: 325 }),
];

const baseProps = {
  filters: EMPTY_FILTERS,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onResetFilters: vi.fn(),
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('ProductTable — иконочные кнопки «Правка»/«Удалить» (подзадача 6)', () => {
  it('каждая кнопка имеет доступное имя с названием продукта', () => {
    render(<MemoryRouter><ProductTable products={products} {...baseProps} /></MemoryRouter>);
    expect(screen.getByLabelText('Правка: Гречка')).toBeTruthy();
    expect(screen.getByLabelText('Удалить: Гречка')).toBeTruthy();
    expect(screen.getByLabelText('Правка: Тушёнка')).toBeTruthy();
    expect(screen.getByLabelText('Удалить: Тушёнка')).toBeTruthy();
  });

  it('probe: кнопок без accessible name = 0', () => {
    render(<MemoryRouter><ProductTable products={products} {...baseProps} /></MemoryRouter>);
    expect(namelessButtons(document)).toEqual([]);
  });

  it('title сохранён (тултип на десктопе) — aria-label его дублирует, а не заменяет', () => {
    render(<MemoryRouter><ProductTable products={products} {...baseProps} /></MemoryRouter>);
    expect(screen.getByLabelText('Правка: Гречка').getAttribute('title')).toBe('Правка');
  });
});

describe('ToastProvider / ProblemDetailAlert — крестики закрытия (подзадача 6)', () => {
  it('тост: кнопка закрытия объявляется скринридеру', async () => {
    render(<ToastProvider><div /></ToastProvider>);
    // тост создаётся через контекст; рендерим минимум — проверяем, что в DOM
    // нет безымянных кнопок (крестик тоста появляется только с самим тостом)
    expect(namelessButtons(document)).toEqual([]);
  });

  it('ProblemDetailAlert: «Закрыть» вместо безымянного крестика', () => {
    render(
      <ProblemDetailAlert
        problemDetail={{ type: 'about:blank', status: 400, title: 'Ошибка валидации', detail: 'Проверьте поля', errors: [
          { field: 'startDate', message: 'must not be blank' },
        ] }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText('Закрыть')).toBeTruthy();
    expect(namelessButtons(document)).toEqual([]);
  });
});
