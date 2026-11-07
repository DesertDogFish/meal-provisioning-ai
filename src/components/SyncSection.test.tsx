/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ToastProvider } from './ToastProvider';

const state = { syncing: false, pending: 2, lastRunAt: null as number | null, lastSent: 0, lastFailed: 0 };
const forceSync = vi.fn();
const listeners: Array<(s: typeof state) => void> = [];

vi.mock('../sync/SyncManager', () => ({
  syncManager: {
    getState: () => ({ ...state }),
    subscribe: (cb: (s: typeof state) => void) => { listeners.push(cb); return () => {}; },
    refreshPending: vi.fn(async () => 2),
    forceSync: (...args: unknown[]) => forceSync(...args),
  },
}));

let online = true;
vi.mock('../hooks/useOffline', () => ({ useOffline: () => ({ online, offlineMode: !online }) }));

import SyncSection from './SyncSection';

function renderSection() {
  return render(<ToastProvider><SyncSection /></ToastProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.pending = 2;
  state.syncing = false;
  state.lastRunAt = null;
  online = true;
});

describe('SyncSection — синк в боковом меню (п.14)', () => {
  it('показывает статус сети и очередь', () => {
    renderSection();
    expect(screen.getByTestId('sync-status').textContent).toContain('Онлайн');
    expect(screen.getByTestId('sync-pending').textContent).toContain('2');
  });

  it('кнопка «Синхронизировать» вызывает принудительный синк и показывает тост', async () => {
    forceSync.mockResolvedValue({ sent: 2, failed: 0, total: 2, skipped: false });
    renderSection();
    fireEvent.click(screen.getByTestId('sync-now'));
    await waitFor(() => expect(forceSync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Синхронизировано: 2/)).toBeTruthy());
  });

  it('офлайн — синк не запускается, показывается ошибка', async () => {
    online = false;
    renderSection();
    fireEvent.click(screen.getByTestId('sync-now'));
    await waitFor(() => expect(screen.getByText(/Нет сети/)).toBeTruthy());
    expect(forceSync).not.toHaveBeenCalled();
  });

  it('интервал автосинка настраивается и сохраняется', () => {
    renderSection();
    const select = screen.getByTestId('sync-interval') as HTMLSelectElement;
    expect(select.value).toBe('5'); // по умолчанию 5 минут
    fireEvent.change(select, { target: { value: '10' } });
    expect(JSON.parse(localStorage.getItem('pv.sync.settings')!).intervalMin).toBe(10);
  });

  it('«выключен» сохраняется как disabled', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('sync-interval'), { target: { value: '0' } });
    expect(JSON.parse(localStorage.getItem('pv.sync.settings')!).enabled).toBe(false);
  });
});
