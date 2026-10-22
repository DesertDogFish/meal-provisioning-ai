// MODE-сьют 01..08 (PLAN.md Фаза 10, P0 п.3)
// Интеграционные тесты машины состояний режимов: client.ts + watchdog.ts + mode.ts
//
// Реальные сетевые запросы подменяются моком global.fetch, чтобы проверить,
// в какую именно "сеть" уходят запросы в каждом режиме.
//
// Важно: модуль apiMode переиспользуется между тестами через vi.resetModules()
// + динамический import, чтобы каждый кейд стартует с чистого singleton-клиента.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Общие переключаемые стабы для мока ./client (используются в MODE-06).
// Объявлены на верхнем уровне, т.к. hoisted-вызов vi.mock не видит const внутри describe.
const clientStub = {
  mode: 'auto' as string,
  getImpl: async (_p: string): Promise<any> => ({ ok: true }),
};

vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    api: {
      getMode: () => clientStub.mode as any,
      get: (path: string) => clientStub.getImpl(path),
    },
  };
});

type FetchCall = { url: string; method: string };

let fetchCalls: FetchCall[] = [];
let fetchShouldFail = false; // имитация недоступного бэкенда
let fetchDelayMs = 0;

function installFetchMock() {
  fetchCalls = [];
  fetchShouldFail = false;
  fetchDelayMs = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; signal?: AbortSignal }) => {
    fetchCalls.push({ url: String(url), method: init?.method ?? 'GET' });
    if (fetchDelayMs > 0) {
      await new Promise(r => setTimeout(r, fetchDelayMs));
    }
    if (fetchShouldFail) {
      throw new TypeError('Failed to fetch'); // как браузер при connection refused
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ version: 'test', db: 'postgres' }),
    };
  }));
}

/** Свежая копия клиента (singleton пересоздаётся после resetModules). */
async function freshClient() {
  vi.resetModules();
  const mod = await import('./client');
  return mod.api;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MODE-01: AUTO, API доступен → клиент резолвится в real, запросы уходят в сеть', () => {
  it('resolveMode пингует /meta и выбирает real', async () => {
    const api = await freshClient(); // localStorage пуст → не разрешён → auto-пинг
    expect(api.isResolved()).toBe(false);

    const mode = await api.resolveMode();
    expect(mode).toBe('real');
    expect(api.getMode()).toBe('real');
    expect(fetchCalls.some(c => c.url.endsWith('/meta'))).toBe(true);
  });

  it('в resolved real-режиме GET уходит на baseUrl fetch, а не в mockServer', async () => {
    const api = await freshClient();
    api.setMode('real');

    const data = await api.get('/recipes');
    expect(fetchCalls.some(c => c.url.endsWith('/recipes'))).toBe(true);
    expect(data).toEqual({ version: 'test', db: 'postgres' });
  });

  it('резолв идемпотентен: повторный resolveMode не пингует снова', async () => {
    const api = await freshClient();
    await api.resolveMode();
    const n = fetchCalls.length;
    await api.resolveMode();
    expect(fetchCalls.length).toBe(n);
  });
});

describe('MODE-02: AUTO, API недоступен → фолбэк в mock, данные из сида', () => {
  it('resolveMode при сетевой ошибке выбирает mock', async () => {
    fetchShouldFail = true;
    const api = await freshClient();
    const mode = await api.resolveMode();
    expect(mode).toBe('mock');
    expect(api.isResolved()).toBe(true);
  });

  it('после фолбэка запросы обслуживает mockServer (0 новых fetch)', async () => {
    fetchShouldFail = true;
    const api = await freshClient();
    await api.resolveMode();
    const nAfterResolve = fetchCalls.length;

    vi.useFakeTimers();
    const p = api.get<any[]>('/recipes');
    await vi.runAllTimersAsync(); // mock-задержка 200-400мс
    const recipes = await p;
    vi.useRealTimers();

    expect(fetchCalls.length).toBe(nAfterResolve); // ни одного запроса в сеть
    expect(Array.isArray(recipes)).toBe(true);     // данные из сида
    expect(recipes.length).toBeGreaterThan(0);
  });

  it('фолбэк сохраняется в localStorage — следующий клиент стартует сразу в mock', async () => {
    fetchShouldFail = true;
    const api1 = await freshClient();
    await api1.resolveMode();
    expect(localStorage.getItem('apiMode')).toBe('mock');

    const api2 = await freshClient(); // "перезагрузка"
    expect(api2.isResolved()).toBe(true);
    expect(api2.getMode()).toBe('mock');
  });
});

describe('MODE-03: FORCE_API (mode=real), API недоступен → ошибка, ретрай возможен', () => {
  it('real-режим НЕ молча фолбэчится: get бросает ApiClientError', async () => {
    const api = await freshClient();
    api.setMode('real');
    fetchShouldFail = true;

    const { ApiClientError } = await import('./client');
    let caught: unknown;
    try {
      await api.get('/recipes');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TypeError); // сетевая ошибка проброшена наружу
    void ApiClientError;
  });

  it('HTTP 500 в real-режиме → ApiClientError с ProblemDetail', async () => {
    const api = await freshClient();
    api.setMode('real');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ status: 500, title: 'Boom', detail: 'db down' }),
    })));

    const { ApiClientError } = await import('./client');
    await expect(api.get('/recipes')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('ретрай после восстановления API успешен', async () => {
    const api = await freshClient();
    api.setMode('real');
    fetchShouldFail = true;
    await expect(api.get('/meta')).rejects.toThrow();

    fetchShouldFail = false; // API "починили"
    const meta = await api.get('/meta');
    expect(meta).toEqual({ version: 'test', db: 'postgres' });
  });
});

describe('MODE-04: FORCE_MOCK, API доступен → ноль запросов к API', () => {
  it('все запросы идут в mockServer, fetch не вызывается вообще', async () => {
    const api = await freshClient();
    api.setMode('mock'); // force mock, хотя fetch бы работал

    vi.useFakeTimers();
    const p1 = api.get('/recipes');
    await vi.runAllTimersAsync();
    const recipes = await p1;

    const p2 = api.get('/meta');
    await vi.runAllTimersAsync();
    await p2;
    vi.useRealTimers();

    expect(fetchCalls).toHaveLength(0);
    expect(Array.isArray(recipes)).toBe(true);
  });

  it('force-mock переживает перезагрузку (persist в localStorage)', async () => {
    const api1 = await freshClient();
    api1.setMode('mock');

    const api2 = await freshClient();
    expect(api2.getMode()).toBe('mock');
    expect(api2.isResolved()).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('MODE-05: Смена режима → состояние обновлено, persist, следующий запрос в новом режиме', () => {
  it('setMode(mock) посреди real-сессии переключает маршрут данных', async () => {
    const api = await freshClient();
    api.setMode('real');
    await api.get('/recipes');
    expect(fetchCalls.length).toBe(1);

    api.setMode('mock');
    vi.useFakeTimers();
    const p = api.get('/recipes');
    await vi.runAllTimersAsync();
    await p;
    vi.useRealTimers();

    expect(fetchCalls.length).toBe(1); // новых сетевых запросов нет
    expect(localStorage.getItem('apiMode')).toBe('mock');
  });

  it('setMode(real) после mock начинает ходить в сеть', async () => {
    const api = await freshClient();
    api.setMode('mock');
    api.setMode('real');
    await api.get('/recipes');
    expect(fetchCalls.some(c => c.url.endsWith('/recipes'))).toBe(true);
  });

  it('resetSeedData чистит mock-кеш (seedVersion + mockData)', async () => {
    localStorage.setItem('mockData', '{"stale":true}');
    const api = await freshClient();
    api.resetSeedData();
    // seedVersion перезаписан текущей версией, старый кеш удалён
    expect(localStorage.getItem('mockData')).toBeNull();
    expect(localStorage.getItem('seedVersion')).not.toBeNull();
  });
});

describe('MODE-06: Watchdog → фолбэк+событие при падении, восстановление', () => {
  /**
   * В watchdog пинги идут через api.get('/meta').
   * Мокнем ./client через vi.mock с переключаемым поведением (без doMock —
   * чтобы mock не «прилипал» к последующим resetModules в других сюитах).
   */
  const stub = { mode: 'auto' as string, getImpl: async (_p: string): Promise<any> => ({ ok: true }) };
  vi.mock('./client', async () => {
    const actual = await vi.importActual<typeof import('./client')>('./client');
    return {
      ...actual,
      api: {
        getMode: () => stub.mode as any,
        get: (path: string) => stub.getImpl(path),
      },
    };
  });

  beforeEach(() => {
    stub.mode = 'auto';
    stub.getImpl = async () => ({ ok: true });
  });

  async function freshWatchdog() {
    vi.resetModules();
    return await import('./watchdog');
  }

  it('первый пинг при старте: available=true → callback с латентностью', async () => {
    const wd = await freshWatchdog();
    const events: Array<[boolean, number | null, string | null]> = [];
    wd.onWatchdogChange((a, l, e) => events.push([a, l, e]));

    wd.startWatchdog(60000);
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0][0]).toBe(true);
    expect(typeof events[0][1]).toBe('number');
    wd.stopWatchdog();
  });

  it('API упал → callback(available=false, error) на fail-пине', async () => {
    stub.getImpl = async () => { throw new Error('Connection refused'); };
    const wd = await freshWatchdog();
    const events: Array<[boolean, number | null, string | null]> = [];
    wd.onWatchdogChange((a, l, e) => events.push([a, l, e]));

    wd.startWatchdog(60000);
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0][0]).toBe(false);
    expect(events[0][1]).toBeNull();
    expect(events[0][2]).toContain('Connection refused');
    expect(wd.getLastAvailability()).toBe(false);
    wd.stopWatchdog();
  });

  it('полный цикл: up → down → up генерирует события с корректными флагами', async () => {
    let online = true;
    stub.getImpl = async () => {
      if (!online) throw new Error('Connection refused');
      return { ok: true };
    };
    const wd = await freshWatchdog();
    const events: Array<[boolean, number | null, string | null]> = [];
    wd.onWatchdogChange((a, l, e) => events.push([a, l, e]));

    vi.useFakeTimers();
    wd.startWatchdog(1000);
    await vi.advanceTimersByTimeAsync(0); // первоначальный пинг
    expect(wd.getLastAvailability()).toBe(true);

    online = false;
    await vi.advanceTimersByTimeAsync(1000); // пинг по интервалу — fail
    expect(events.at(-1)?.[0]).toBe(false);
    expect(events.at(-1)?.[2]).toContain('Connection refused');
    expect(wd.getLastAvailability()).toBe(false);

    online = true;
    await vi.advanceTimersByTimeAsync(1000); // восстановление
    expect(events.at(-1)?.[0]).toBe(true);
    expect(wd.getLastAvailability()).toBe(true);

    wd.stopWatchdog();
    vi.useRealTimers();
  });

  it('в mock-режиме watchdog не пингует (get не вызывается)', async () => {
    const getSpy = vi.fn(async () => ({ ok: true }));
    stub.mode = 'mock';
    stub.getImpl = getSpy;
    const wd = await freshWatchdog();

    wd.startWatchdog(500);
    await Promise.resolve();
    await Promise.resolve();
    wd.stopWatchdog();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('stopWatchdog останавливает интервал, unsubscribe убирает callback', async () => {
    let online = true;
    stub.getImpl = async () => {
      if (!online) throw new Error('down');
      return { ok: true };
    };
    const wd = await freshWatchdog();
    const events: boolean[] = [];
    const unsub = wd.onWatchdogChange((a) => events.push(a));

    vi.useFakeTimers();
    wd.startWatchdog(1000);
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    online = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(events).toEqual([true]); // больше ничего не пришло после отписки
    wd.stopWatchdog();
    vi.useRealTimers();
  });
});

describe('MODE-07: Сканирование импортов — AppContext/mockData только внутри src/api', () => {
  it('ни один файл вне src/api не импортирует mockData/AppContext', async () => {
    const { execSync } = await import('child_process');
    const out = execSync(
      `grep -rlE "from ['\\\"].*(data/mockData|AppContext)" src --include="*.ts" --include="*.tsx" ` +
      `| grep -v "^src/api/" || true`,
      { encoding: 'utf8' }
    ).trim();
    expect(out).toBe('');
  });
});

describe('MODE-08: Перезагрузка страницы → режим сохраняется', () => {
  it('real сохранён → новый клиент сразу real без пинга', async () => {
    localStorage.setItem('apiMode', 'real');
    const api = await freshClient();
    expect(api.getMode()).toBe('real');
    expect(api.isResolved()).toBe(true);
    expect(fetchCalls.filter(c => c.url.endsWith('/meta'))).toHaveLength(0);
  });

  it('mock сохранён → новый клиент сразу mock', async () => {
    localStorage.setItem('apiMode', 'mock');
    const api = await freshClient();
    expect(api.getMode()).toBe('mock');
    expect(api.isResolved()).toBe(true);
  });

  it('VITE_API_MODE используется как fallback, если localStorage пуст', async () => {
    (import.meta as any).env.VITE_API_MODE = 'mock';
    const api = await freshClient();
    expect(api.getMode()).toBe('mock');
    expect(api.isResolved()).toBe(true);
    delete (import.meta as any).env.VITE_API_MODE;
  });

  it('localStorage приоритетнее VITE_API_MODE', async () => {
    (import.meta as any).env.VITE_API_MODE = 'mock';
    localStorage.setItem('apiMode', 'real');
    const api = await freshClient();
    expect(api.getMode()).toBe('real');
    delete (import.meta as any).env.VITE_API_MODE;
  });
});
