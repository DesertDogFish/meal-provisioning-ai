/**
 * BL-41 (AU-13): диалог «данные изменились» на 409 CONCURRENT_MODIFICATION.
 * Контракт карточки: диалог появляется по сигналу, «Обновить» перечитывает данные
 * и закрывает диалог, «Закрыть» закрывает без перезагрузки.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictDialog } from './ConflictDialog';
import { notifyConcurrentModification, resetConcurrentModificationListeners } from '../api/conflictSignal';

afterEach(() => {
  resetConcurrentModificationListeners();
});

describe('ConflictDialog (BL-41)', () => {
  it('скрыт, пока конфликта нет', () => {
    render(<ConflictDialog onReload={vi.fn()} />);
    expect(screen.queryByTestId('conflict-dialog')).toBeNull();
  });

  it('появляется по сигналу 409 CONCURRENT_MODIFICATION', async () => {
    render(<ConflictDialog onReload={vi.fn()} />);
    act(() => { notifyConcurrentModification(); });
    await waitFor(() => expect(screen.getByTestId('conflict-dialog')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Данные изменились' })).toBeTruthy();
  });

  it('«Обновить» вызывает перезагрузку и закрывает диалог', async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    render(<ConflictDialog onReload={onReload} />);
    act(() => { notifyConcurrentModification(); });
    await waitFor(() => expect(screen.getByTestId('conflict-dialog')).toBeTruthy());

    fireEvent.click(screen.getByTestId('conflict-dialog-reload'));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('conflict-dialog')).toBeNull());
  });

  it('«Закрыть» закрывает без перезагрузки', async () => {
    const onReload = vi.fn();
    render(<ConflictDialog onReload={onReload} />);
    act(() => { notifyConcurrentModification(); });
    await waitFor(() => expect(screen.getByTestId('conflict-dialog')).toBeTruthy());

    fireEvent.click(screen.getByTestId('conflict-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('conflict-dialog')).toBeNull());
    expect(onReload).not.toHaveBeenCalled();
  });
});
