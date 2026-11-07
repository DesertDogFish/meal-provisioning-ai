/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  DEFAULT_SYNC_SETTINGS,
  getSyncSettings,
  setSyncSettings,
  subscribeSyncSettings,
  resetSyncSettings,
} from './syncSettings';

describe('syncSettings (п.14: настраиваемый автосинк)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSyncSettings();
  });

  it('по умолчанию автосинк включён и идёт раз в 5 минут', () => {
    expect(DEFAULT_SYNC_SETTINGS).toEqual({ enabled: true, intervalMin: 5 });
    expect(getSyncSettings()).toEqual({ enabled: true, intervalMin: 5 });
  });

  it('интервал сохраняется в localStorage', () => {
    setSyncSettings({ intervalMin: 15 });
    expect(getSyncSettings().intervalMin).toBe(15);
    expect(JSON.parse(localStorage.getItem('pv.sync.settings')!).intervalMin).toBe(15);
  });

  it('«0 минут» выключает автосинк', () => {
    setSyncSettings({ intervalMin: 0 });
    expect(getSyncSettings().enabled).toBe(false);
  });

  it('неизвестный интервал нормализуется к дефолтным 5 минутам', () => {
    setSyncSettings({ intervalMin: 7 as unknown as number });
    expect(getSyncSettings().intervalMin).toBe(5);
  });

  it('подписчики получают новое значение', () => {
    const spy = vi.fn();
    const un = subscribeSyncSettings(spy);
    setSyncSettings({ intervalMin: 30 });
    expect(spy).toHaveBeenCalledWith({ enabled: true, intervalMin: 30 });
    un();
    setSyncSettings({ intervalMin: 10 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
