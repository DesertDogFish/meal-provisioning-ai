/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const queue: Array<{ id: string; entityType: string; entityId: string; action: string; payload: unknown }> = [];
let online = true;

vi.mock('./SyncQueue', () => ({
  syncQueue: {
    getAll: vi.fn(async () => queue),
    remove: vi.fn(async () => {}),
    incrementRetry: vi.fn(async () => {}),
  },
}));

vi.mock('./NetworkMonitor', () => ({
  networkMonitor: { isOnline: () => online, subscribe: () => () => {} },
}));

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(async () => ({})), put: vi.fn(), del: vi.fn() },
}));

import { SyncManager } from './SyncManager';
import { setSyncSettings, resetSyncSettings } from './syncSettings';

describe('SyncManager — автосинк по расписанию (п.14)', () => {
  let manager: SyncManager;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetSyncSettings();
    queue.length = 0;
    online = true;
    manager = new SyncManager();
  });

  afterEach(() => {
    manager.stopAutoSync();
    vi.useRealTimers();
  });

  it('startAutoSync запускает синк каждые 5 минут (значение по умолчанию)', async () => {
    const spy = vi.spyOn(manager, 'syncAll').mockResolvedValue(undefined);
    manager.startAutoSync();

    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('смена интервала в настройках пересобирает таймер', async () => {
    const spy = vi.spyOn(manager, 'syncAll').mockResolvedValue(undefined);
    manager.startAutoSync();

    setSyncSettings({ intervalMin: 10 });
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('выключенный автосинк не стреляет вовсе', async () => {
    const spy = vi.spyOn(manager, 'syncAll').mockResolvedValue(undefined);
    setSyncSettings({ enabled: false });
    manager.startAutoSync();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('без сети принудительный синк возвращает skipped и не отправляет ничего', async () => {
    online = false;
    const result = await manager.forceSync();
    expect(result.skipped).toBe(true);
  });
});
