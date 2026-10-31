/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { namelessButtons } from '../test/a11y';
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

  it('слот превью существует ДО выбора блюда (компактная подсказка в одну строку)', async () => {
    renderModal();
    const slot = await screen.findByTestId('meal-preview-slot');
    // подзадача 8 (30.10.2026): до выбора — ОДНА строка подсказки, не заглушка на пол-модалки
    expect(screen.getByTestId('meal-preview-hint').textContent).toContain('после выбора блюда');
    expect(screen.queryByTestId('meal-preview')).toBeNull();
    expect(slot.contains(screen.getByTestId('meal-preview-hint'))).toBe(true);
  });

  it('выбор блюда: превью рендерится ВНУТРИ того же слота — высота модалки не меняется', async () => {
    renderModal();
    const slot = await screen.findByTestId('meal-preview-slot');
    fireEvent.click(await screen.findByRole('option', { name: /Уха/ }));
    const preview = await screen.findByTestId('meal-preview');
    expect(preview.textContent).toContain('Уха');
    expect(slot.contains(preview)).toBe(true);
    // фиксированная высота слота живёт на превью выбранного блюда (Fix-8 п.4)
    expect(preview.className).toContain('h-32');
  });
});

// UX-осмотр 31.10 (подзадача 6): в модалке «Добавить приём пищи» осмотр насчитал
// 8 кнопок без accessible name (крестик, сегменты типа приёма, ссылка «Добавить
// и настроить состав», очистка поиска). Probe — регресс-страж критерия приёмки.
describe('AddMealModal — a11y: доступные имена кнопок (подзадача 6)', () => {
  it('probe: кнопок без accessible name = 0', async () => {
    renderModal();
    await screen.findByTestId('meal-preview-slot');
    expect(namelessButtons(document)).toEqual([]);
  });

  it('крестик закрытия объявляется как «Закрыть»', async () => {
    renderModal();
    await screen.findByTestId('meal-preview-slot');
    expect(screen.getByLabelText('Закрыть')).toBeTruthy();
  });
});

/**
 * KB-29 (UX-осмотр 31.10, подзадача 13): deep-link «В меню похода…» открывает
 * модалку с предвыбранным блюдом, а каталог блюд догружается АСИНХРОННО. Пока
 * каталога нет, в слоте превью одна строка подсказки; когда блюдо нашлось —
 * карточка h-32. Лист вырастал на ~110px уже после открытия, центрированная
 * модалка «съезжала» на ~30–50px, и координатный клик по «Добавить» приходился
 * мимо кнопки (pointerdown/pointerup на разных элементах → click не наш).
 * Фикс: высота слота зарезервирована на всё время догрузки предвыбора.
 */
describe('AddMealModal — KB-29: лист не меняет высоту при догрузке предвыбранного блюда', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deep-link (?recipe=): слот превью зарезервирован ДО загрузки каталога и после', async () => {
    let release: (v: unknown) => void = () => {};
    (getRecipes as any).mockReturnValue(new Promise(res => { release = res; }));
    renderModal({ initialRecipeId: 'r1' });

    const slot = await screen.findByTestId('meal-preview-slot');
    expect(slot.className).toContain('meal-preview-slot--reserved');

    release([RECIPE]);
    const preview = await screen.findByTestId('meal-preview');
    expect(slot.contains(preview)).toBe(true);
    // высота та же: резерв не снят, лист не «поехал»
    expect(slot.className).toContain('meal-preview-slot--reserved');
  });

  it('без deep-link подсказка остаётся компактной (резерв не включается)', async () => {
    (getRecipes as any).mockResolvedValue([RECIPE]);
    renderModal();
    const slot = await screen.findByTestId('meal-preview-slot');
    expect(screen.getByTestId('meal-preview-hint')).toBeTruthy();
    expect(slot.className).not.toContain('meal-preview-slot--reserved');
  });
});
