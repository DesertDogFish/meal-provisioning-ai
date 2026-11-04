/**
 * KB-15: серверная синхронизация отметок «взято» чеклиста похода.
 *
 * Аудит зафиксировал три класса ошибок, которые эти тесты и закрывают:
 *  A) union «всегда» воскрешал отметку, снятую на другом устройстве →
 *     семантика «сервер побеждает» для чистого кэша + dirty-флаг для офлайна;
 *  B) гонки PUT/refresh: два быстрых клика и refresh «до клика» затирали
 *     актуальное состояние → последовательная очередь PUT + снимок seq.
 *
 * Сервер эмулируется здесь: PUT — ПОЛНАЯ замена набора (как backend
 * ChecklistBought.replaceAll), GET — снимок на момент вызова (важно для гонок).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const st = vi.hoisted(() => ({
  /** tripId -> набор клиентских ключей «на сервере» */
  server: new Map<string, string[]>(),
  /** задержки PUT по индексу вызова (мс) — для проверки очереди */
  putDelays: [] as number[],
  putCalls: [] as string[][],
  concurrent: 0,
  maxConcurrent: 0,
  putFails: false,
  /** первый GET отвечает вручную (снимок уже сделан, ответ отложен) */
  holdFirstGet: false,
  releaseGet: null as null | (() => void),
  getCalls: 0,
}));

vi.mock('../api/client', () => {
  const parseTrip = (path: string) => {
    const m = /^\/trips\/([^/]+)\/checklist-bought$/.exec(path);
    if (!m) throw new Error(`unexpected url ${path}`);
    return m[1];
  };
  const snapshot = (tripId: string) =>
    (st.server.get(tripId) ?? []).map(key => {
      const [ingredientId, neededStamp] = key.split('@');
      return { ingredientId, neededStamp: Number(neededStamp) };
    });
  return {
    api: {
      // GET — снимок серверного набора НА МОМЕНТ вызова (ответ может прийти позже)
      get: vi.fn((path: string) => {
        const tripId = parseTrip(path);
        st.getCalls += 1;
        const shot = snapshot(tripId);
        if (st.holdFirstGet && st.getCalls === 1) {
          st.holdFirstGet = false;
          return new Promise(resolve => { st.releaseGet = () => resolve(shot); });
        }
        return Promise.resolve(shot);
      }),
      // PUT — идемпотентная ПОЛНАЯ замена
      put: vi.fn(async (path: string, body: { items: Array<{ ingredientId: number | string; neededStamp: number }> }) => {
        const tripId = parseTrip(path);
        const callIndex = st.putCalls.length;
        st.concurrent += 1;
        st.maxConcurrent = Math.max(st.maxConcurrent, st.concurrent);
        try {
          const delay = st.putDelays[callIndex] ?? 0;
          if (delay) await new Promise(r => setTimeout(r, delay));
          if (st.putFails) throw new Error('offline');
          const keys = (body.items ?? []).map(it => `${it.ingredientId}@${it.neededStamp}`);
          st.putCalls.push(keys);
          st.server.set(tripId, keys);
          return body.items;
        } finally {
          st.concurrent -= 1;
        }
      }),
      post: vi.fn(),
      del: vi.fn(),
    },
  };
});

import { api } from '../api/client';

import { loadBought, setBought, refreshBoughtFromServer, flushBoughtPuts } from './tripStaging';

const TRIP = 't1';
const DIRTY_KEY = `trip-checklist-bought-dirty-${TRIP}`;
const BOUGHT_KEY = `trip-checklist-bought-${TRIP}`;
/** Кэш в LS, оставшийся от другой сессии/устройства (без dirty-флага). */
const seedCache = (keys: string[]) => localStorage.setItem(BOUGHT_KEY, JSON.stringify(keys));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  st.server.clear();
  st.putCalls = [];
  st.putDelays = [];
  st.concurrent = 0;
  st.maxConcurrent = 0;
  st.putFails = false;
  st.holdFirstGet = false;
  st.releaseGet = null;
  st.getCalls = 0;
});

describe('KB-15 (A): «сервер побеждает» для чистого кэша', () => {
  it('отметка снята на сервере другим устройством → после refresh её НЕТ локально и PUT не отправляется', async () => {
    seedCache(['5@2000']);                       // устаревший кэш: отметка была
    st.server.set(TRIP, []);                     // на сервере её уже сняли
    expect(loadBought(TRIP).has('5@2000')).toBe(true);

    const result = await refreshBoughtFromServer(TRIP);

    expect([...result]).toEqual([]);
    expect([...loadBought(TRIP)]).toEqual([]);   // удаление ПРИМЕНЕНО локально
    expect(st.putCalls).toEqual([]);             // и обратно на сервер не досылается
  });

  it('LS пуст + отметка есть на сервере → появляется локально, PUT не нужен', async () => {
    st.server.set(TRIP, ['12@5000']);

    await refreshBoughtFromServer(TRIP);

    expect([...loadBought(TRIP)]).toEqual(['12@5000']);
    expect(st.putCalls).toEqual([]);
  });

  it('серверный набор заменяет локальный ПОЛНОСТЬЮ (не union): старая локальная отметка снимается', async () => {
    seedCache(['5@2000', '6@3000']);
    st.server.set(TRIP, ['6@3000']);

    await refreshBoughtFromServer(TRIP);

    expect([...loadBought(TRIP)]).toEqual(['6@3000']);
  });
});

describe('KB-15 (A): dirty-флаг — union только для несинхронизированных правок', () => {
  it('офлайн-правка (dirty) → union + досылка; после успеха dirty снят', async () => {
    st.putFails = true;                          // в магазине нет связи
    setBought(TRIP, new Set(['5@2000']));
    await flushBoughtPuts(TRIP);
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');
    expect([...loadBought(TRIP)]).toEqual(['5@2000']);

    st.putFails = false;
    st.server.set(TRIP, ['12@5000']);            // сервер успел получить отметку с другого устройства
    st.putCalls = [];

    const merged = await refreshBoughtFromServer(TRIP);
    await flushBoughtPuts(TRIP);

    expect([...merged].sort()).toEqual(['12@5000', '5@2000']); // локальное не потеряно
    expect([...loadBought(TRIP)].sort()).toEqual(['12@5000', '5@2000']);
    expect([...st.putCalls[st.putCalls.length - 1]!].sort()).toEqual(['12@5000', '5@2000']); // объединение дослано
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();               // dirty снят при успехе
  });

  it('dirty переживает перезагрузку страницы (персистентный флаг, не данные)', async () => {
    // «перезагрузка»: память пуста, в LS — кэш + флаг синхронизации
    seedCache(['7@700']);
    localStorage.setItem(DIRTY_KEY, '1');
    st.server.set(TRIP, []);

    const result = await refreshBoughtFromServer(TRIP);
    await flushBoughtPuts(TRIP);

    expect([...result]).toEqual(['7@700']);   // офлайн-отметка не затёрта серверным «пусто»
    expect(st.putCalls[st.putCalls.length - 1]).toEqual(['7@700']);
  });

  it('сервер недоступен (null) → локальные не затираются, dirty сохраняется', async () => {
    st.putFails = true;
    setBought(TRIP, new Set(['7@1000', '9@500']));
    await flushBoughtPuts(TRIP);
    st.putCalls = [];

    vi.mocked(api.get).mockImplementationOnce(() => Promise.reject(new Error('ECONNREFUSED')));
    const result = await refreshBoughtFromServer(TRIP);

    expect([...loadBought(TRIP)].sort()).toEqual(['7@1000', '9@500']);
    expect([...result].sort()).toEqual(['7@1000', '9@500']);
    expect(st.putCalls).toEqual([]);                    // пустой набор на сервер не досылаем
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');  // dirty не сброшен
  });

  it('мягкий таймаут: сервер не ответил → работаем на локальном кэше, экран не висит', async () => {
    seedCache(['3@300']);
    st.holdFirstGet = true;            // GET «висит»
    const started = Date.now();

    const result = await refreshBoughtFromServer(TRIP, { timeoutMs: 20 });

    expect(Date.now() - started).toBeLessThan(500);
    expect([...result]).toEqual(['3@300']);
    expect([...loadBought(TRIP)]).toEqual(['3@300']);
    st.releaseGet?.();
  });
});

describe('KB-15 (B): сериализация PUT и снимок refresh', () => {
  it('гонка: два быстрых setBought → на сервере ПОСЛЕДНИЙ набор, PUT-ы не параллельны', async () => {
    st.putDelays = [15, 0];            // первый PUT медленный — без очереди он перетёр бы второй
    setBought(TRIP, new Set(['1@100']));
    setBought(TRIP, new Set(['1@100', '2@200']));

    await flushBoughtPuts(TRIP);

    expect(st.maxConcurrent).toBe(1);                              // строго последовательно
    expect(st.putCalls).toEqual([['1@100'], ['1@100', '2@200']]);  // порядок кликов
    expect(st.server.get(TRIP)).toEqual(['1@100', '2@200']);       // сервер = последнее состояние
  });

  it('refresh, стартовавший ДО клика, не применяет устаревший снимок', async () => {
    st.server.set(TRIP, []);
    st.holdFirstGet = true;                  // снимок «пусто» сделан сейчас, ответ отложен
    const refresh = refreshBoughtFromServer(TRIP);

    setBought(TRIP, new Set(['7@700']));     // клик, пока GET летит
    await flushBoughtPuts(TRIP);             // PUT успел: на сервере 7@700, dirty снят
    st.releaseGet?.();                        // сервер отвечает снимком, снятым ДО клика

    const result = await refresh;

    expect([...loadBought(TRIP)]).toEqual(['7@700']);   // свежий ввод не затёрт
    expect([...result]).toEqual(['7@700']);
  });

  it('setBought снимает dirty только при успехе ПОСЛЕДНЕЙ отправки', async () => {
    st.putDelays = [10, 0];
    setBought(TRIP, new Set(['1@100']));     // первый PUT «висит» в очереди
    setBought(TRIP, new Set(['1@100', '2@200']));
    // пока первый PUT в полёте, dirty обязан остаться (вторая правка ещё не на сервере)
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');

    await flushBoughtPuts(TRIP);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
  });
});

describe('KB-15 (MAJOR A): neededStamp=0 валиден, мусорные штампы не держат dirty', () => {
  it('ключ <id>@0 уходит на сервер вместе с остальными и не держит dirty', async () => {
    // Нулевая потребность: «взять всё» одним кликом кладёт '<id>@0'. Если бы
    // клиент отбрасывал 0, сервер не получил бы часть набора, а dirty остался бы.
    setBought(TRIP, new Set(['12@0', '13@2000']));
    await flushBoughtPuts(TRIP);

    expect(st.putCalls[st.putCalls.length - 1]!.sort()).toEqual(['12@0', '13@2000']);
    expect(st.server.get(TRIP)!.sort()).toEqual(['12@0', '13@2000']);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
    expect([...loadBought(TRIP)].sort()).toEqual(['12@0', '13@2000']);
  });

  it('отрицательный/дробный штамп не уходит, не валит остальные и вычищается из кэша', async () => {
    setBought(TRIP, new Set(['12@5000', '9@-100', '10@2000.5']));
    await flushBoughtPuts(TRIP);

    // валидный остаток уехал целиком (один битый ключ не валит PUT)
    expect(st.putCalls).toEqual([['12@5000']]);
    expect(st.server.get(TRIP)).toEqual(['12@5000']);
    // неотправляемые ключи вычищены из локального кэша...
    expect([...loadBought(TRIP)]).toEqual(['12@5000']);
    // ...поэтому вечного dirty нет
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();

    // и следующая гидрация ничего не «воскрешает»
    const after = await refreshBoughtFromServer(TRIP);
    expect([...after]).toEqual(['12@5000']);
    expect([...loadBought(TRIP)]).toEqual(['12@5000']);
  });
});

describe('KB-15 (R12): только неотправляемые ключи при пустом сервере — dirty не вечный', () => {
  it('кэш из одних битых ключей: PUT пропущен, dirty снят, серверный снимок применяется', async () => {
    st.server.set(TRIP, []);                      // сервер пуст — расхождения нет
    setBought(TRIP, new Set(['9@-100']));         // в кэше ТОЛЬКО неотправляемое
    await flushBoughtPuts(TRIP);

    expect(st.putCalls).toEqual([]);              // ни одной валидной пары — PUT не делался
    expect([...loadBought(TRIP)]).toEqual([]);    // ключ вычищен из локального кэша
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull(); // вечного dirty нет

    const after = await refreshBoughtFromServer(TRIP);
    expect([...after]).toEqual([]);               // серверный «пусто» применился
    expect([...loadBought(TRIP)]).toEqual([]);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
    expect(st.putCalls).toEqual([]);              // и повторной досылки не появилось
  });

  it('dirty из LS + битый ключ в кэше: refresh снимает флаг за один проход', async () => {
    // «перезагрузка» после офлайн-клика по битому ключу: память пуста, в LS кэш + флаг
    seedCache(['9@-100']);
    localStorage.setItem(DIRTY_KEY, '1');
    st.server.set(TRIP, []);

    const result = await refreshBoughtFromServer(TRIP);
    await flushBoughtPuts(TRIP);

    expect([...result]).toEqual([]);
    expect([...loadBought(TRIP)]).toEqual([]);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull(); // без фикса флаг оставался навсегда
    st.putCalls = [];

    // вторая гидрация — обычная «сервер побеждает», без досылки
    const again = await refreshBoughtFromServer(TRIP);
    expect([...again]).toEqual([]);
    expect(st.putCalls).toEqual([]);
  });
});

describe('KB-15 (MAJOR B): строковые ingredientId (mock-каталог) синхронизируются', () => {
  it('набор из строковых id уходит на сервер, dirty снимается и отметка переживает refresh', async () => {
    setBought(TRIP, new Set(['ing7@2000']));
    await flushBoughtPuts(TRIP);

    expect(st.putCalls).toEqual([['ing7@2000']]);
    expect(st.server.get(TRIP)).toEqual(['ing7@2000']);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();

    const after = await refreshBoughtFromServer(TRIP);
    expect([...after]).toEqual(['ing7@2000']);   // серверный снимок не «стёр» строковый id
    expect([...loadBought(TRIP)]).toEqual(['ing7@2000']);
  });

  it('смешанный набор (числовые + строковые) не теряет ничего на втором refresh', async () => {
    setBought(TRIP, new Set(['12@5000', 'ing7@2000']));
    await flushBoughtPuts(TRIP);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();

    await refreshBoughtFromServer(TRIP);
    const again = await refreshBoughtFromServer(TRIP);

    expect([...again].sort()).toEqual(['12@5000', 'ing7@2000']);
    expect([...loadBought(TRIP)].sort()).toEqual(['12@5000', 'ing7@2000']);
    expect(st.putCalls).toHaveLength(1);          // гидрация чистого кэша PUT не делает
  });
});

describe('KB-15 (R11): мягкий таймаут — свой у каждого вызывающего', () => {
  it('зависший общий GET не блокирует вызов с timeoutMs (печать ждёт не дольше таймаута)', async () => {
    seedCache(['3@300']);
    st.holdFirstGet = true;                     // GET «висит» навсегда
    const first = refreshBoughtFromServer(TRIP); // страница похода: без явного таймаута
    const started = Date.now();

    const second = await refreshBoughtFromServer(TRIP, { timeoutMs: 20 });

    expect(Date.now() - started).toBeLessThan(1000);
    expect([...second]).toEqual(['3@300']);      // отдали локальный кэш
    expect(st.getCalls).toBe(1);                 // но GET остался ОДИН (не плодим запросы)

    st.releaseGet?.();
    await expect(first).resolves.toBeDefined();
  });
});
