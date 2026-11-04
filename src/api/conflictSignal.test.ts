/**
 * BL-41 (AU-13): сигнал конфликта оптимистичной блокировки.
 *
 * Проверяем ровно контракт модуля:
 *  - 409 + код CONCURRENT_MODIFICATION распознаётся в обеих формах ошибки
 *    (real: ApiClientError → err.error; mock/плоский объект → корень);
 *  - прочие 409 (уникальность/занятый email/синхронизация) НЕ считаются
 *    конфликтом оптимистичной блокировки;
 *  - подписчики получают сигнал, отписка работает, падение подписчика не
 *    ломает остальных;
 *  - client.ts поднимает сигнал на 409 от mock-сервера (сквозная проводка).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONCURRENT_MODIFICATION_CODE,
  isConcurrentModification,
  notifyConcurrentModification,
  onConcurrentModification,
  resetConcurrentModificationListeners,
} from './conflictSignal';
import { ApiClientError } from './problemDetailParser';
import { api } from './client';
import { armConcurrentConflict, clearConcurrentConflict } from './mockState';

beforeEach(() => {
  resetConcurrentModificationListeners();
  clearConcurrentConflict();
});

describe('isConcurrentModification', () => {
  it('распознаёт ApiClientError из real-режима (статус/detail внутри err.error)', () => {
    const err = new ApiClientError({
      status: 409,
      title: 'Conflict',
      detail: `${CONCURRENT_MODIFICATION_CODE}: Данные изменились, пока вы их редактировали.`,
    });
    expect(isConcurrentModification(err)).toBe(true);
  });

  it('распознаёт плоский объект ошибки из mock-режима', () => {
    expect(isConcurrentModification({
      status: 409,
      title: 'Conflict',
      detail: `${CONCURRENT_MODIFICATION_CODE}: ...`,
    })).toBe(true);
  });

  it('409 БЕЗ кода — другой конфликт, не оптимистичная блокировка', () => {
    expect(isConcurrentModification({ status: 409, detail: 'Email already registered' })).toBe(false);
    expect(isConcurrentModification({ status: 409, title: 'SYNC_ALREADY_RUNNING' })).toBe(false);
  });

  it('не-409 и мусор — false (без исключений)', () => {
    expect(isConcurrentModification({ status: 500, detail: CONCURRENT_MODIFICATION_CODE })).toBe(false);
    expect(isConcurrentModification(null)).toBe(false);
    expect(isConcurrentModification(undefined)).toBe(false);
    expect(isConcurrentModification('CONCURRENT_MODIFICATION')).toBe(false);
  });
});

describe('подписка на сигнал', () => {
  it('уведомляет подписчика и снимает его по отписке', () => {
    const first = vi.fn();
    const second = vi.fn();
    const off = onConcurrentModification(first);
    onConcurrentModification(second);

    notifyConcurrentModification();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    off();
    notifyConcurrentModification();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('падение одного подписчика не мешает остальным', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = vi.fn(() => { throw new Error('boom'); });
    const healthy = vi.fn();
    onConcurrentModification(broken);
    onConcurrentModification(healthy);

    expect(() => notifyConcurrentModification()).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('сквозная проводка client → сигнал (mock-паритет 409)', () => {
  it('PUT, получивший 409 CONCURRENT_MODIFICATION, поднимает сигнал', async () => {
    api.setMode('mock');
    const listener = vi.fn();
    onConcurrentModification(listener);
    armConcurrentConflict('trip1');

    await expect(api.put('/trips/trip1/checklist-bought', { items: [] }))
      .rejects.toMatchObject({ status: 409 });
    expect(listener).toHaveBeenCalledTimes(1);

    // инъекция одноразовая: следующий PUT того же похода проходит
    await expect(api.put('/trips/trip1/checklist-bought', { items: [] })).resolves.toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('обычный 409 (не блокировка) сигнал НЕ поднимает', async () => {
    api.setMode('mock');
    const listener = vi.fn();
    onConcurrentModification(listener);

    // регистрация занятого email — 409 Conflict без кода CONCURRENT_MODIFICATION
    await expect(api.post('/auth/register', {
      email: 'admin@provision.app', password: 'password123', firstName: 'A', lastName: 'B',
    })).rejects.toMatchObject({ status: 409 });
    expect(listener).not.toHaveBeenCalled();
  });
});
