/**
 * Подзадача 24 (план plans/done/2026-10-29-full-audit.md): unit-тесты modeResolver —
 * приоритет localStorage → VITE_API_MODE (window.meta-канал) → auto-пинг /meta
 * (Fix-11: real только для JSON-API), single-flight резолва, персист и сид-версия.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModeResolver, readInjectedEnv } from './modeResolver';

const BASE = 'http://test.local/api/v1';

let fetchMock: ReturnType<typeof vi.fn>;

function setMetaEnv(env: Record<string, string>) {
  (window as unknown as { meta?: { env?: Record<string, string> } }).meta = { env };
}

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete (window as unknown as { meta?: unknown }).meta;
  vi.unstubAllGlobals();
});

describe('ModeResolver — начальное состояние', () => {
  it('чистый старт → mock, не резолвлен; seedVersion записан', () => {
    const r = new ModeResolver();
    expect(r.getMode()).toBe('mock');
    expect(r.isResolved()).toBe(false);
    expect(localStorage.getItem('seedVersion')).toBe('1.0.0');
  });

  it('localStorage apiMode=real → сразу real без пинга', async () => {
    localStorage.setItem('apiMode', 'real');
    const r = new ModeResolver();
    expect(r.isResolved()).toBe(true);
    await expect(r.resolveMode(BASE)).resolves.toBe('real');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('мусорный apiMode в localStorage игнорируется', () => {
    localStorage.setItem('apiMode', 'auto'); // не 'mock'/'real'
    const r = new ModeResolver();
    expect(r.isResolved()).toBe(false);
  });

  it('VITE_API_MODE=mock через window.meta.env → резолвлен mock (readInjectedEnv-канал)', () => {
    setMetaEnv({ VITE_API_MODE: 'mock' });
    expect(readInjectedEnv().VITE_API_MODE).toBe('mock');
    const r = new ModeResolver();
    expect(r.isResolved()).toBe(true);
    expect(r.getMode()).toBe('mock');
  });
});

describe('ModeResolver.resolveMode — auto-пинг (Fix-11)', () => {
  it('200 + JSON content-type → real, персист в localStorage', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"db":"ok"}', {
      status: 200, headers: { 'Content-Type': 'application/json' }
    }));
    const r = new ModeResolver();
    await expect(r.resolveMode(BASE)).resolves.toBe('real');
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/meta`, expect.objectContaining({ method: 'GET' }));
    expect(localStorage.getItem('apiMode')).toBe('real');
  });

  it('200 + HTML (SPA-rewrite на статхостинге) → mock', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html></html>', {
      status: 200, headers: { 'Content-Type': 'text/html' }
    }));
    const r = new ModeResolver();
    await expect(r.resolveMode(BASE)).resolves.toBe('mock');
    expect(localStorage.getItem('apiMode')).toBe('mock');
  });

  it('сеть недоступна → mock (без исключения)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const r = new ModeResolver();
    await expect(r.resolveMode(BASE)).resolves.toBe('mock');
  });

  it('параллельные resolveMode — ОДИН пинг (single-flight)', async () => {
    fetchMock.mockImplementationOnce(() => new Promise(resolve =>
      setTimeout(() => resolve(new Response('{}', {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })), 10)));
    const r = new ModeResolver();
    const [a, b] = await Promise.all([r.resolveMode(BASE), r.resolveMode(BASE)]);
    expect(a).toBe('real');
    expect(b).toBe('real');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ModeResolver — setMode / resetSeedData', () => {
  it('setMode персистит и помечает резолвленным', async () => {
    const r = new ModeResolver();
    r.setMode('real');
    expect(r.isResolved()).toBe(true);
    expect(localStorage.getItem('apiMode')).toBe('real');
    await expect(r.resolveMode(BASE)).resolves.toBe('real');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resetSeedData чистит mockData и перезаписывает seedVersion', () => {
    localStorage.setItem('mockData', '{"x":1}');
    localStorage.setItem('seedVersion', '0.0.1');
    const r = new ModeResolver();
    r.resetSeedData();
    expect(localStorage.getItem('mockData')).toBeNull();
    expect(localStorage.getItem('seedVersion')).toBe('1.0.0');
  });
});
