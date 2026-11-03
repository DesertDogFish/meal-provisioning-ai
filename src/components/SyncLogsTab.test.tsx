/**
 * bugs-app-ui п.2: «Журнал синков» мигал при обновлении — loadSyncLogs() каждый
 * раз делал setLoading(true), и рендер `loading ? <PageLoader/> : <table>`
 * заменял таблицу лоаджером (поллинг RUNNING каждые 2 с, смена фильтров).
 * Контракт после фикса: PageLoader — только ПЕРВАЯ загрузка; при обновлении
 * таблица остаётся смонтированной, данные подменяются на месте.
 */
/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock('./ToastProvider', () => ({
  useToast: () => ({ showError, showSuccess }),
}));

const getMock = vi.fn();
vi.mock('../api/client', async () => {
  class ApiClientError extends Error {
    error: any;
    constructor(error: any) { super(error?.detail ?? 'api error'); this.error = error; }
  }
  return {
    ApiClientError,
    api: {
      get: (...args: unknown[]) => getMock(...args),
      post: vi.fn(),
      postFile: vi.fn(),
    },
  };
});

import { SyncLogsTab } from './SyncLogsTab';

const KPI = { totalRuns: 5, successRate: 80, totalUpdated: 3, totalErrors: 1 };

/** RUNNING-запуск — включает поллинг журнала (интервал 2 с, Fix-15). */
const runningLog = (id: number) => ({
  id, provider: 'ROSSTAT', type: 'PRICES', status: 'RUNNING',
  triggeredBy: 'MANUAL', triggeredUserEmail: 'admin@provision.app',
  startedAt: '2026-11-03T10:00:00Z', finishedAt: null, durationSeconds: null,
  createdCount: 0, updatedCount: 0, errorCount: 0,
  details: { requestCount: 0, items: [], errors: [] },
});

describe('SyncLogsTab — обновление без мигания таблицы (bugs-app-ui п.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getMock.mockReset();
    showError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('первая загрузка показывает PageLoader; поллинг обновляет данные, НЕ размонтируя таблицу', async () => {
    let syncCalls = 0;
    let resolveSecond: (() => void) | null = null;
    getMock.mockImplementation((path: string) => {
      if (path.endsWith('/kpi')) return Promise.resolve(KPI);
      syncCalls += 1;
      if (syncCalls === 1) return Promise.resolve([runningLog(1)]);
      // второй (поллинг) запрос «висит» — проверяем, что таблица на месте
      return new Promise((resolve) => { resolveSecond = () => resolve([runningLog(1), { ...runningLog(2), status: 'SUCCESS' }]); });
    });

    render(<SyncLogsTab onGoToSettings={() => {}} />);

    // первая загрузка: данных ещё нет — виден брендовый лоаджер
    expect(screen.getByTestId('page-loader')).toBeTruthy();

    // первый ответ пришёл — таблица смонтирована
    await screen.findByTestId('sync-log-row-1');
    expect(screen.queryByTestId('page-loader')).toBeNull();
    // дожидаемся пассивных эффектов: поллинг RUNNING регистрирует интервал
    // (без этого flush эффект выполнится уже ПОСЛЕ перемотки часов)
    await act(async () => {});

    // поллинг RUNNING: через 2 с уходит второй запрос (pending) —
    // таблица НЕ должна исчезать и заменяться лоаджером
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(syncCalls).toBe(2);
    expect(screen.queryByTestId('page-loader')).toBeNull();
    expect(screen.getByTestId('sync-log-row-1')).toBeTruthy();

    // ответ поллинга подменяет данные на месте
    await act(async () => { resolveSecond!(); });
    await screen.findByTestId('sync-log-row-2');
    expect(screen.queryByTestId('page-loader')).toBeNull();
  });
});
