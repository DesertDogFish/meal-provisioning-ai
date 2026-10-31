/// <reference types="vitest/globals" />
/**
 * U39 (список 26.10, red-green): кнопка «Удалить» у продукта, добавленного в блюдо
 * в походе. Баг: серверная EXTRA-строка после «Удалить» оставалась в desired-PUT
 * ({state:'EXTRA'}) и воскресала при сохранении. Фикс: черновик REMOVED — строка
 * скрывается и НЕ попадает в PUT (keepExtra-семантика: отсутствует ⇒ удаляется).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MealCompositionModal from './MealCompositionModal';
import { ToastProvider } from './ToastProvider';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  getMealComposition: vi.fn(),
  putMealComposition: vi.fn(),
  humanize: (n: number, u: string) => `${n} ${u}`,
  packHint: () => null,
  humanizeWeight: (g: number) => `${g} г`,
  formatRub: undefined,
}));

import { api, getMealComposition, putMealComposition } from '../api/client';

const composition = {
  mealId: 'm1',
  dayDate: '2026-05-01',
  mealType: 'LUNCH' as const,
  people: 4,
  baseServings: 2,
  recipeId: 'rec1',
  recipeName: 'Каша гречневая',
  items: [
    {
      ingredientId: '1', name: 'Гречка', unit: 'KG' as const,
      packSize: null, pieceWeightG: null, kcalPer100g: 350,
      baseAmountPerServing: 0.2, derivedAmount: 0.4, effectiveAmount: 0.4,
      state: 'RECIPE' as const, ratio: null, substitutedFrom: null, kcalTotal: 0,
    },
    {
      ingredientId: '9', name: 'Сахар', unit: 'KG' as const,
      packSize: null, pieceWeightG: null, kcalPer100g: 400,
      baseAmountPerServing: null, derivedAmount: null, effectiveAmount: 0.005,
      state: 'EXTRA' as const, ratio: null, substitutedFrom: null, kcalTotal: 0,
    },
  ],
  substitutions: [],
  totals: { kcal: 1420, weightGrams: 405, plannedCost: 100 },
};

const renderModal = (onSaved = vi.fn()) =>
  render(
    <ToastProvider>
      <MealCompositionModal tripId="t1" mealId="m1" isAdmin onSaved={onSaved} onClose={() => {}} />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (getMealComposition as any).mockResolvedValue(JSON.parse(JSON.stringify(composition)));
  (putMealComposition as any).mockImplementation((_t: string, _m: string, body: any) =>
    Promise.resolve({ ...composition, items: body.items }),
  );
  (api.get as any).mockImplementation((path: string) => {
    if (path.startsWith('/admin/products')) {
      return Promise.resolve({
        content: [
          { id: '1', name: 'Гречка', unit: 'KG', category: 'Крупы', enabled: true },
          { id: '9', name: 'Сахар', unit: 'KG', category: 'Специи', enabled: true },
          { id: '12', name: 'Соль', unit: 'KG', category: 'Специи', enabled: true },
        ],
      });
    }
    if (path === '/product-categories') {
      return Promise.resolve([{ id: 'c1', name: 'Крупы' }]);
    }
    return Promise.resolve([]);
  });
});

describe('MealCompositionModal — U39 удаление добавленного продукта', () => {
  it('серверная EXTRA-строка: «Удалить» скрывает строку, PUT без неё, after save — удалена', async () => {
    renderModal();
    // EXTRA-строка видна
    expect(await screen.findByText('Сахар')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Удалить: Сахар'));
    // строка скрыта сразу (до сохранения)
    await waitFor(() => expect(screen.queryByText('Сахар')).toBeNull());

    // «Сохранить» активна (isDirty) и отправляет desired-PUT БЕЗ сахара
    const saveBtn = screen.getByLabelText('Сохранить состав');
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveBtn);

    await waitFor(() => expect(putMealComposition).toHaveBeenCalledTimes(1));
    const body = (putMealComposition as any).mock.calls[0][2];
    const ids = body.items.map((i: any) => String(i.ingredientId));
    expect(ids).not.toContain('9'); // EXTRA отсутствует ⇒ сервер удалит правку
    expect(ids).toContain('1');    // рецептурная строка остаётся
    const grech = body.items.find((i: any) => String(i.ingredientId) === '1');
    expect(grech.state).toBe('RECIPE');
  });

  it('RECIPE-строки остаются в PUT, количество EXTRA в г (U31: 5 г, не 0,005 кг)', async () => {
    renderModal();
    await screen.findByText('Сахар');
    // AmountInput EXTRA-строки: 0,005 кг → граммовый режим → «5»
    const qty = screen.getByTestId('qty-9');
    expect((qty as HTMLInputElement).value).toBe('5');
    const qtyGrech = screen.getByTestId('qty-1');
    expect((qtyGrech as HTMLInputElement).value).toBe('400'); // 0,4 кг → 400 г
  });

  it('«Сбросить» возвращает удалённую EXTRA-строку (черновик снимается)', async () => {
    renderModal();
    await screen.findByText('Сахар');
    fireEvent.click(screen.getByLabelText('Удалить: Сахар'));
    await waitFor(() => expect(screen.queryByText('Сахар')).toBeNull());
    fireEvent.click(screen.getByLabelText('Сбросить изменения'));
    expect(await screen.findByText('Сахар')).toBeTruthy();
  });
});

/**
 * Transparency-п.3 (AGENTS §8 — сначала красный тест): правка состава сбрасывает
 * введённый чек и отметки «взято»/факт-количества по затронутым позициям
 * (поведение бэкенда, README «Состав приёма под себя»), но UI сохранял молча —
 * пользователь терял введённые суммы без предупреждения. Фикс: ConfirmDialog
 * (тон warning) со списком позиций ПЕРЕД batch PUT.
 */
import { saveActualPrice, setBought, setActualQty } from '../utils/tripStaging';

describe('MealCompositionModal — transparency-п.3: предупреждение о сбросе чека', () => {
  beforeEach(() => {
    localStorage.removeItem('trip-actual-prices-t1');
    localStorage.removeItem('trip-checklist-bought-t1');
    localStorage.removeItem('trip-checklist-actualqty-t1');
  });

  it('введён чек по затрагиваемой позиции → подтверждение, PUT только после «Да»', async () => {
    saveActualPrice('t1', '1', { price: 250, total: 100 });
    renderModal();
    await screen.findByText('Гречка');
    fireEvent.click(screen.getByLabelText('Исключить: Гречка'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить состав' }));

    // до подтверждения PUT НЕ выполняется
    const yes = await screen.findByTestId('confirm-yes');
    expect(yes).toBeTruthy();
    const dialog = screen.getByRole('alertdialog', { name: 'Сбросить введённый чек?' });
    expect(within(dialog).getByText(/сбросит введённый чек/)).toBeTruthy();
    expect(within(dialog).getByText(/Гречка/)).toBeTruthy();
    expect(putMealComposition).not.toHaveBeenCalled();

    fireEvent.click(yes);
    await waitFor(() => expect(putMealComposition).toHaveBeenCalledTimes(1));
  });

  it('отмена подтверждения — состав НЕ сохраняется', async () => {
    saveActualPrice('t1', '1', { price: 250, total: 100 });
    renderModal();
    await screen.findByText('Гречка');
    fireEvent.click(screen.getByLabelText('Исключить: Гречка'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить состав' }));
    fireEvent.click(await screen.findByTestId('confirm-cancel'));
    await waitFor(() => expect(screen.queryByTestId('confirm-yes')).toBeNull());
    expect(putMealComposition).not.toHaveBeenCalled();
  });

  it('отметка «взято» без чека → предупреждение тоже есть', async () => {
    setBought('t1', new Set(['1@400']));
    renderModal();
    await screen.findByText('Гречка');
    fireEvent.click(screen.getByLabelText('Исключить: Гречка'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить состав' }));
    expect(await screen.findByTestId('confirm-yes')).toBeTruthy();
  });

  it('факт-количество «Взяли» → предупреждение есть', async () => {
    setActualQty('t1', '1', { amount: 500, unit: 'г' });
    renderModal();
    await screen.findByText('Гречка');
    fireEvent.click(screen.getByLabelText('Исключить: Гречка'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить состав' }));
    expect(await screen.findByTestId('confirm-yes')).toBeTruthy();
  });

  it('не затрагивает позиции без чеков/отметок → диалога нет, сохраняет сразу', async () => {
    // чек введён по ДРУГОЙ позиции (id 999 — не из этого состава)
    saveActualPrice('t1', '999', { price: 10, total: 10 });
    renderModal();
    await screen.findByText('Гречка');
    fireEvent.click(screen.getByLabelText('Исключить: Гречка'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить состав' }));
    await waitFor(() => expect(putMealComposition).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('confirm-yes')).toBeNull();
  });

  it('удаление ingredента (EXTRA «Удалить») с чеком по нему → предупреждение', async () => {
    saveActualPrice('t1', '9', { price: 20, total: 5 });
    renderModal();
    await screen.findByText('Сахар');
    fireEvent.click(screen.getByLabelText('Удалить: Сахар'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить состав' }));
    const yes = await screen.findByTestId('confirm-yes');
    // REMOVED-строка скрыта из таблицы, но имя осталось в списке диалога
    const dialog = screen.getByRole('alertdialog', { name: 'Сбросить введённый чек?' });
    expect(within(dialog).getByText(/Сахар/)).toBeTruthy();
    fireEvent.click(yes);
    await waitFor(() => expect(putMealComposition).toHaveBeenCalledTimes(1));
  });
});
