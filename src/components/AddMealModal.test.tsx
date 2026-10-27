/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AddMealModal from './AddMealModal';
import { ToastProvider } from './ToastProvider';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  getRecipes: vi.fn(),
  humanize: (n: number, u: string) => `${n} ${u}`,
}));

import { getRecipes } from '../api/client';

const DAY = { dayId: 'd1', dayDate: '2026-07-10', dayIndex: 2 };

const RECIPE = {
  id: 'r1',
  name: 'Уха',
  mealType: 'LUNCH',
  ingredients: [],
  caloriesPerServing: 400,
};

function renderModal(props: Partial<React.ComponentProps<typeof AddMealModal>> = {}) {
  return render(
    <ToastProvider>
      <AddMealModal
        tripId="t1"
        tripName="Алтай"
        defaultPeople={4}
        day={DAY}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        {...props}
      />
    </ToastProvider>
  );
}

/**
 * Fix-8 (п.4): модалка «Добавить приём пищи» НЕ меняет размер:
 *  - место под inline-список поиска блюда зарезервировано всегда
 *    (открыт список или закрыт — одна и та же фиксированная высота);
 *  - слот превью выбранного блюда — постоянной высоты (h-32): до выбора
 *    показывает подсказку, после — карточку (длинный состав скроллится внутри).
 * «Не должен ехать экран от такого.»
 */
describe('AddMealModal — постоянный размер формы (Fix-8 п.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getRecipes as any).mockResolvedValue([RECIPE]);
  });

  it('при autoFocus список открыт и имеет фиксированную высоту', async () => {
    renderModal();
    const list = await screen.findByRole('listbox');
    expect(list.className).toContain('h-44 sm:h-56');
  });

  it('клик вне поля закрывает список — высота зарезервирована заглушкой (модалка не схлопывается)', async () => {
    const { baseElement } = renderModal();
    const input = await screen.findByRole('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    // «клик вне» компонента поиска (mousedown на оверлее модалки)
    fireEvent.mouseDown(baseElement.querySelector('.modal-overlay')!);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    const reserved = baseElement.querySelector('.rss-list-reserved');
    expect(reserved).toBeTruthy();
    expect(reserved!.className).toContain('h-44 sm:h-56');
  });

  it('слот превью существует ДО выбора блюда (постоянная высота, подсказка)', async () => {
    renderModal();
    const slot = await screen.findByTestId('meal-preview-slot');
    expect(slot.className).toContain('h-32');
    expect(slot.textContent).toContain('Выберите блюдо');
    expect(screen.queryByTestId('meal-preview')).toBeNull();
  });

  it('выбор блюда: превью рендерится ВНУТРИ того же слота — высота модалки не меняется', async () => {
    renderModal();
    const slot = await screen.findByTestId('meal-preview-slot');
    fireEvent.click(await screen.findByRole('option', { name: /Уха/ }));
    const preview = await screen.findByTestId('meal-preview');
    expect(preview.textContent).toContain('Уха');
    expect(slot.contains(preview)).toBe(true);
    expect(slot.className).toContain('h-32');
  });
});
