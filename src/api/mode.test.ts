// MODE-сьют 01..08 (PLAN.md Фаза 10, P0 п.3)
// Интеграционные тесты машины состояний режимов: client.ts + watchdog.ts
//
// Реальные сетевые запросы подменяются моком global.fetch, чтобы проверить,
// в какую именно «сеть» уходят запросы в каждом режиме (real fetch vs mockServer).
//
// Важно: singleton-клиент пересоздаётся между кейсами через vi.resetModules()
// + динамический import — каждый тест стартует с чистого состояния.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type FetchCall = { url: string; method: string };

let fetchCalls: FetchCall[] = [];
let fetchShouldFail = false; // имитация недоступного бэкенда

function installFetchMock() {
  fetchCalls = [];
  fetchShouldFail = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    fetchCalls.push({ url: String(url), method: init?.method ?? 'GET' });
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

/**
 * Свежая копия клиента («начало страницы»): конструктор заново читает
 * localStorage/env. Через класс, а не через singleton `api`, чтобы тесты
 * MODE-01..05/08 не зависели от общего состояния модуля.
 */
async function freshClient(envOverrides?: Record<string, string>) {
  // Vite заменяет статическое обращение import.meta.env.* в исходниках на литералы,
  // поэтому ни vi.stubEnv, ни присваивание в (import.meta as any).env не действуют.
  // Обход: нестатический доступ через window['meta'] (Vite его не трансформирует) —
  // см. src/api/client.ts. Подменяем значения на время создания клиента.
  const meta = ((window as any).meta ??= {});
  const saved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(envOverrides ?? {})) {
    saved[k] = meta.env?.[k];
    meta.env[k] = v;
  }
  vi.resetModules();
  const mod = await import('./client');
  const client = new mod.ApiClient();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete meta.env[k];
    else meta.env[k] = v;
  }
  return client;
}

/**
 * Клиент, к которому подключён watchdog (пингует именно singleton `api`).
 * NOTE: vi.resetModules() не пере-собирает ./client при наличии статической
 * ссылки из графа тестового файла (Vitest 1.x), поэтому для watchdog-тестов
 * работаем с реальным singleton и восстанавливаем его состояние после теста.
 */
async function freshWatchdogSetup(mode: 'real' | 'mock') {
  const [{ api }, wd] = await Promise.all([import('./client'), import('./watchdog')]);
  wd.stopWatchdog(); // страховка: интервал из предыдущего теста
  api.setMode(mode);
  return { api, wd };
}

/** Прогон промиса mock-задержки (200-400мс): крутим таймеры до готовности. */
async function runMockRequest<T>(p: Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    let settled = false;
    p.then(() => { settled = true; }).catch(() => { settled = true; });
    while (!settled) {
      await vi.advanceTimersByTimeAsync(50);
    }
    return await p;
  } finally {
    vi.useRealTimers();
  }
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
    const api = await freshClient(); // localStorage пуст → не разрешён
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

  it('первый get() без явного resolveMode запускает авто-резолв', async () => {
    const api = await freshClient();
    await api.get('/recipes'); // request() должен сам резолвить режим
    expect(api.getMode()).toBe('real');
    expect(fetchCalls.filter(c => c.url.endsWith('/meta')).length).toBe(1);
    expect(fetchCalls.filter(c => c.url.endsWith('/recipes')).length).toBe(1);
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

    const recipes = await runMockRequest(api.get<any[]>('/recipes'));

    expect(fetchCalls.length).toBe(nAfterResolve); // ни одного запроса в сеть
    expect(Array.isArray(recipes)).toBe(true);     // данные из сида
    expect(recipes.length).toBeGreaterThan(0);
  });

  it('фолбэк сохраняется в localStorage — следующий клиент стартует сразу в mock', async () => {
    fetchShouldFail = true;
    const api1 = await freshClient();
    await api1.resolveMode();
    expect(localStorage.getItem('apiMode')).toBe('mock');

    const api2 = await freshClient(); // «перезагрузка»
    expect(api2.isResolved()).toBe(true);
    expect(api2.getMode()).toBe('mock');
  });
});

describe('MODE-03: FORCE_API (mode=real), API недоступен → ошибка, ретрай возможен', () => {
  it('real-режим НЕ молча фолбэчится: сетевая ошибка проброшена наружу', async () => {
    const api = await freshClient();
    api.setMode('real');
    fetchShouldFail = true;

    await expect(api.get('/recipes')).rejects.toBeInstanceOf(TypeError);
    // и режим остался real — никакого тихого переключения на mock
    expect(api.getMode()).toBe('real');
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
    let caught: InstanceType<typeof ApiClientError> | undefined;
    try {
      await api.get('/recipes');
    } catch (e) {
      caught = e as InstanceType<typeof ApiClientError>;
    }
    expect(caught).toBeInstanceOf(ApiClientError);
    expect(caught?.error.status).toBe(500);
    expect(caught?.error.detail).toBe('db down');
  });

  it('ретрай после восстановления API успешен', async () => {
    const api = await freshClient();
    api.setMode('real');
    fetchShouldFail = true;
    await expect(api.get('/meta')).rejects.toThrow();

    fetchShouldFail = false; // API «починили»
    const meta = await api.get('/meta');
    expect(meta).toEqual({ version: 'test', db: 'postgres' });
  });
});

describe('MODE-04: FORCE_MOCK, API доступен → ноль запросов к API', () => {
  it('все запросы идут в mockServer, fetch не вызывается вообще', async () => {
    const api = await freshClient();
    api.setMode('mock'); // force mock, хотя fetch бы работал

    const recipes = await runMockRequest(api.get<any[]>('/recipes'));

    expect(fetchCalls).toHaveLength(0);
    expect(Array.isArray(recipes)).toBe(true);
    expect(recipes.length).toBeGreaterThan(0);
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
    await runMockRequest(api.get('/recipes'));

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

describe('MODE-06: Watchdog → события при падении/восстановлении, тишина в mock', () => {
  // Пинги watchdog идут через api.get('/meta') и api.getMode() реального клиента,
  // поэтому управляем доступностью через fetch-мок, а режимом — через setMode().

  it('первый пинг при старте: available=true → callback с латентностью', async () => {
    const { wd } = await freshWatchdogSetup('real');

    const events: Array<[boolean, number | null, string | null]> = [];
    wd.onWatchdogChange((a, l, e) => events.push([a, l, e]));

    wd.startWatchdog(60000);
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0][0]).toBe(true);
    expect(typeof events[0][1]).toBe('number');
    expect(wd.getLastAvailability()).toBe(true);
    wd.stopWatchdog();
  });

  it('API упал → callback(available=false, error), lastAvailable=false', async () => {
    const { wd } = await freshWatchdogSetup('real');
    fetchShouldFail = true;

    const events: Array<[boolean, number | null, string | null]> = [];
    wd.onWatchdogChange((a, l, e) => events.push([a, l, e]));

    wd.startWatchdog(60000);
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(events[0][0]).toBe(false);
    expect(events[0][1]).toBeNull();
    expect(events[0][2]).toMatch(/Failed to fetch|abort/i);
    expect(wd.getLastAvailability()).toBe(false);
    wd.stopWatchdog();
  });

  it('полный цикл: up → down → up генерирует события с корректными флагами', async () => {
    const { wd } = await freshWatchdogSetup('real');

    const events: Array<[boolean, number | null, string | null]> = [];
    wd.onWatchdogChange((a, l, e) => events.push([a, l, e]));

    vi.useFakeTimers();
    try {
      wd.startWatchdog(1000);
      await vi.advanceTimersByTimeAsync(0); // первоначальный пинг
      expect(wd.getLastAvailability()).toBe(true);

      fetchShouldFail = true; // API «упал»
      await vi.advanceTimersByTimeAsync(1000); // пинг по интервалу — fail
      expect(events.at(-1)?.[0]).toBe(false);
      expect(events.at(-1)?.[2]).toBeTruthy();
      expect(wd.getLastAvailability()).toBe(false);

      fetchShouldFail = false; // API «восстановился»
      await vi.advanceTimersByTimeAsync(1000);
      expect(events.at(-1)?.[0]).toBe(true);
      expect(wd.getLastAvailability()).toBe(true);
    } finally {
      wd.stopWatchdog();
      vi.useRealTimers();
    }
  });

  it('в mock-режиме watchdog не пингует (0 запросов, 0 событий)', async () => {
    const { wd } = await freshWatchdogSetup('mock');

    const events: boolean[] = [];
    wd.onWatchdogChange((a) => events.push(a));

    wd.startWatchdog(100);
    await new Promise(r => setTimeout(r, 60));
    expect(fetchCalls).toHaveLength(0);
    expect(events).toHaveLength(0);
    wd.stopWatchdog();
  });

  it('stopWatchdog останавливает интервал, unsubscribe убирает callback', async () => {
    const { wd } = await freshWatchdogSetup('real');

    const events: boolean[] = [];
    const unsub = wd.onWatchdogChange((a) => events.push(a));

    vi.useFakeTimers();
    try {
      wd.startWatchdog(1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(events).toEqual([true]);

      unsub();
      fetchShouldFail = true;
      await vi.advanceTimersByTimeAsync(3000); // пинги идут, но слушателей нет
      expect(events).toEqual([true]);

      wd.stopWatchdog();
      const nBefore = fetchCalls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchCalls.length).toBe(nBefore); // интервал действительно остановлен
    } finally {
      vi.useRealTimers();
    }
  });

  it('startWatchdog идемпотентен: повторный вызов не создаёт второго интервала', async () => {
    const { wd } = await freshWatchdogSetup('real');

    vi.useFakeTimers();
    try {
      wd.startWatchdog(1000);
      wd.startWatchdog(1000); // второй вызов — no-op
      await vi.advanceTimersByTimeAsync(0);
      const nAfterInitial = fetchCalls.length; // 1 пинг /meta

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchCalls.length).toBe(nAfterInitial + 1); // ровно один пинг за тик
    } finally {
      wd.stopWatchdog();
      vi.useRealTimers();
    }
  });
});

describe('MODE-07: Сканирование импортов — AppContext/mockData только внутри src/api', () => {
  it('ни один файл вне src/api не импортирует mockData/AppContext', async () => {
    const { execSync } = await import('child_process');
    const out = execSync(
      `grep -rlE "from ['\\\"]+.*(data/mockData|AppContext)" src --include="*.ts" --include="*.tsx" ` +
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

  it('VITE_API_MODE задаёт режим по умолчанию, если localStorage пуст', async () => {
    const api = await freshClient({ VITE_API_MODE: 'real' });
    expect(api.getMode()).toBe('real'); // env применён сразу
    expect(api.isResolved()).toBe(true); // без лишнего авторызрешения/пинга
    expect(fetchCalls.filter(c => c.url.endsWith('/meta'))).toHaveLength(0);
  });

  it('выбор пользователя из UI приоритетнее VITE_API_MODE на следующем запуске', async () => {
    const api1 = await freshClient({ VITE_API_MODE: 'mock' }); // env: mock
    expect(api1.getMode()).toBe('mock');
    api1.setMode('real');            // пользователь переключился в UI
    expect(localStorage.getItem('apiMode')).toBe('real');

    const api2 = await freshClient(); // «перезагрузка»
    expect(api2.getMode()).toBe('real'); // localStorage победил env
    expect(api2.isResolved()).toBe(true);
  });

  it('неизвестное значение в localStorage игнорируется → авторызрешение', async () => {
    localStorage.setItem('apiMode', 'banana');
    const api = await freshClient();
    expect(api.isResolved()).toBe(false);
    const mode = await api.resolveMode();
    expect(mode).toBe('real'); // fetch смокан и работает
  });
});
