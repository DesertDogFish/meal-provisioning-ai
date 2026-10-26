/// <reference types="vitest/globals" />
/**
 * U40 (список 26.10): ручные позиции закупки — модалка «Продукты к дню/походу».
 * Проверяем: добавление (POST-контракт), удаление, валидацию «продукт+количество»,
 * список уже добавленных позиций.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ManualItemsModal from './ManualItemsModal';
import { ToastProvider } from './ToastProvider';

vi.mock('../api/tripManualItems', () => ({
  addManualItem: vi.fn(),
  deleteManualItem: vi.fn(),
}));

import { addManualItem, deleteManualItem } from '../api/tripManualItems';
import type { TripManualItem } from '../api/tripManualItems';

const products = [
  { id: 'p1', name: 'Антисептик для рук', unit: 'PCS' as const, category: 'Хозтовары' },
  { id: 'p2', name: 'Аптечка набор', unit: 'PACK' as const, category: 'Хозтовары' },
  { id: 'p3', name: 'Соль', unit: 'KG' as const, category: 'Специи' },
];

const existing: TripManualItem[] = [
  {
    id: 'mi1', tripId: 't1', dayId: null, ingredientId: 'p2',
    ingredientName: 'Аптечка набор', unit: 'PACK', amount: 1, note: 'на группу',
  },
];

const renderModal = (props: Partial<React.ComponentProps<typeof ManualItemsModal>> = {}) =>
  render(
    <ToastProvider>
      <ManualItemsModal
        tripId="t1"
        dayId={null}
        items={existing}
        products={products}
        onClose={vi.fn()}
        onChanged={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (addManualItem as any).mockResolvedValue({ id: 'mi-new' });
  (deleteManualItem as any).mockResolvedValue(undefined);
});

describe('ManualItemsModal (U40)', () => {
  it('показывает добавленные позиции и примечание', () => {
    renderModal();
    expect(screen.getByText(/Аптечка набор/)).toBeTruthy();
    expect(screen.getByText(/на группу/)).toBeTruthy();
  });

  it('добавление: продукт из поиска + количество → POST с dayId', async () => {
    const onChanged = vi.fn();
    renderModal({ dayId: 'd2', onChanged });

    // поиск продукта (RecipeSearchSelect)
    const search = screen.getByLabelText('Продукт ручной позиции');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Антисептик' } });
    fireEvent.click(await screen.findByText('Антисептик для рук'));

    // количество (AmountInput, PCS)
    fireEvent.change(screen.getByTestId('manual-amount'), { target: { value: '3' } });

    fireEvent.click(screen.getByLabelText('Добавить позицию'));
    await waitFor(() => expect(addManualItem).toHaveBeenCalledTimes(1));
    expect(addManualItem).toHaveBeenCalledWith('t1', {
      dayId: 'd2',
      ingredientId: 'p1',
      amount: 3,
      note: undefined,
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('валидация: без продукта или количества — POST не выполняется', async () => {
    renderModal();
    fireEvent.click(screen.getByLabelText('Добавить позицию'));
    expect(addManualItem).not.toHaveBeenCalled();
  });

  it('удаление позиции → DELETE + onChanged', async () => {
    const onChanged = vi.fn();
    renderModal({ onChanged });
    fireEvent.click(screen.getByLabelText('Удалить позицию: Аптечка набор'));
    await waitFor(() => expect(deleteManualItem).toHaveBeenCalledWith('t1', 'mi1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('KG-продукт: количество вводится в граммах (U31) — 500 г = 0,5 кг', async () => {
    renderModal({ items: [] });
    const search = screen.getByLabelText('Продукт ручной позиции');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Соль' } });
    fireEvent.click(await screen.findByText('Соль'));
    fireEvent.change(screen.getByTestId('manual-amount'), { target: { value: '500' } });
    fireEvent.click(screen.getByLabelText('Добавить позицию'));
    await waitFor(() => expect(addManualItem).toHaveBeenCalledTimes(1));
    expect((addManualItem as any).mock.calls[0][1].amount).toBeCloseTo(0.5);
  });
});
