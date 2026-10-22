/**
 * P0.5#1: тесты механизма автоматического обновления токенов в ApiClient.
 * Проверяют: refresh на 401 + повтор запроса, отсутствие рекурсии для /auth/*,
 * очистку сессии и событие auth:session-lost при неудачном refresh,
 * single-flight для параллельных 401.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE = 'http://test.local/api/v1';

async function freshClient() {
  vi.resetModules();
  const { ApiClient } = await import('./client');
  // baseUrl через конструктор не задать (env подменяется Vite на литералы при
  // трансформации), поэтому переопределяем поле после создания экземпляра.
  const client = new ApiClient();
  (client as unknown as { baseUrl: string }).baseUrl = BASE;
  return client;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const UNAUTHORIZED = { status: 401, title: 'Unauthorized', detail: 'expired token' };

describe('ApiClient refresh mechanism (P0.5#1)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('apiMode', 'real');
    localStorage.setItem('accessToken', 'old-access');
    localStorage.setItem('refreshToken', 'old-refresh');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refreshes on 401 and retries the original request with new token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED)) // исходный GET /products
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh', tokenType: 'Bearer' })
      ) // POST /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1, name: 'Соль' }])); // ретраенный GET

    const api = await freshClient();
    const result = await api.get<Array<{ id: number; name: string }>>('/products');

    expect(result).toEqual([{ id: 1, name: 'Соль' }]);

    // вызов refresh с old refresh-токеном
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [retryUrl, retryInit] = fetchMock.mock.calls[1];
    expect(retryUrl).toBe(`${BASE}/auth/refresh`);
    expect(retryInit.method).toBe('POST');
    expect(JSON.parse(retryInit.body)).toEqual({ refreshToken: 'old-refresh' });

    // повтор оригинального запроса уже с новым access-токеном
    const [getUrl, getInit] = fetchMock.mock.calls[2];
    expect(getUrl).toBe(`${BASE}/products`);
    expect(getInit.headers.Authorization).toBe('Bearer new-access');

    // оба токена обновлены в хранилище (бэкенд ротирует refresh)
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
  });

  it('clears session and emits auth:session-lost when refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED))
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED)); // refresh отозван

    const api = await freshClient();
    const lostSpy = vi.fn();
    api.onSessionLost(lostSpy);

    await expect(api.get('/products')).rejects.toMatchObject({ error: { status: 401 } });

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(lostSpy).toHaveBeenCalledTimes(1);
    // только 2 вызова: оригинал + refresh, без повтора
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not attempt refresh for /auth/* endpoints (no recursion)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED));

    const api = await freshClient();
    await expect(api.post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/auth/login`);
    // сессия не чистится автоматически — за это отвечает страница логина
    expect(localStorage.getItem('accessToken')).toBe('old-access');
  });

  it('single-flight: parallel 401s trigger exactly one refresh call', async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `${BASE}/auth/refresh`) {
        refreshCalls += 1;
        // искусственная задержка, чтобы оба запроса успели упереться в lock
        await new Promise((r) => setTimeout(r, 10));
        return jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh' });
      }
      // первый заход каждого GET — 401, после обновления токена — 200
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth === 'Bearer new-access') {
        return jsonResponse(200, []);
      }
      return jsonResponse(401, UNAUTHORIZED);
    });

    const api = await freshClient();
    const [a, b] = await Promise.all([api.get('/products'), api.get('/recipes')]);

    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(refreshCalls).toBe(1);
  });

  it('skips refresh entirely when no refresh token stored', async () => {
    localStorage.removeItem('refreshToken');
    fetchMock.mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED));

    const api = await freshClient();
    await expect(api.get('/products')).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
