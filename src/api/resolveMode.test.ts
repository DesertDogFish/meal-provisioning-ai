/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './client';

/**
 * Fix-11 (Vercel): авто-определение режима не должно принимать SPA-фолбэк
 * за API. На статическом хостинге с rewrite «всё → index.html» запрос
 * /api/v1/meta возвращает 200 + HTML; раньше этого хватало, чтобы включить
 * 'real' — и каждый последующий запрос получал HTML вместо JSON (приложение
 * «странно работало»). Теперь 'real' требует 200 И content-type: json.
 */
const htmlResponse = {
  ok: true,
  status: 200,
  headers: { get: () => 'text/html; charset=utf-8' },
};
const jsonResponse = {
  ok: true,
  status: 200,
  headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
};

describe('resolveMode — real только для настоящего JSON-API (Fix-11)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('200 + HTML (SPA-фолбэк статического хостинга) → mock, НЕ real', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse));
    const client = new ApiClient();
    await client.resolveMode();
    expect(client.getMode()).toBe('mock');
    expect(localStorage.getItem('apiMode')).toBe('mock');
  });

  it('200 + application/json → real', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse));
    const client = new ApiClient();
    await client.resolveMode();
    expect(client.getMode()).toBe('real');
  });

  it('404 (нет бэкенда) → mock', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 404, headers: { get: () => 'text/plain' },
    })));
    const client = new ApiClient();
    await client.resolveMode();
    expect(client.getMode()).toBe('mock');
  });

  it('сетевая ошибка/таймаут → mock', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const client = new ApiClient();
    await client.resolveMode();
    expect(client.getMode()).toBe('mock');
  });
});
