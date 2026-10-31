/**
 * Подзадача 24 (план plans/done/2026-10-29-full-audit.md): резолвер режима API.
 *
 * Приоритет: localStorage(`apiMode`) → VITE_API_MODE → auto-пинг GET {baseUrl}/meta
 * (Fix-11: «real» только для настоящего JSON-API). Выделено из client.ts без
 * изменения логики; baseUrl передаётся вызывающим на каждый резолв (тесты
 * подменяют его после конструктора).
 *
 * Не путать с `mode.ts` — там машина состояний «auto/api/mock» для watchdog/UI-бейджа.
 */

export type ApiMode = 'mock' | 'real';

const SEED_VERSION = '1.0.0';
const LS_MODE_KEY = 'apiMode';
const LS_SEED_KEY = 'seedVersion';

/**
 * NOTE: window['meta'] — намеренно нестатический доступ: Vite заменяет статическое
 * обращение import.meta.env.* на литералы при сборке, из-за чего тестовые подмены
 * (vi.stubEnv / присваивание) не применяются. В браузере window.meta пуст → fallback.
 * window.meta.env — канал подмены env в тестах; сам объект meta может быть
 * задан без вложенного env, поэтому берём env из meta с fallback.
 */
export function readInjectedEnv(): Record<string, string> {
  const injectedMeta = (window as unknown as { meta?: { env?: Record<string, string> } }).meta;
  return (
    injectedMeta?.env ??
    injectedMeta ??
    ((import.meta as any).env || {})
  );
}

/**
 * transparency-п.4 (решение владельца 31.10.2026 — вариант A «прод = только
 * real») + BL-52: mock-режим (демо-данные, бейдж, переключатель) доступен ТОЛЬКО
 * в dev-сборке или при явном build-флаге `VITE_ENABLE_MOCK=true`. В прод-сборке
 * без флага: режим всегда real, mock-фолбэк при недоступном бэкенде отключён —
 * страницы показывают человеческую ошибку с «Повторить» (navigation-п.4), а не
 * тихий уход на демо-данные.
 *
 * DEV читается через readInjectedEnv (window.meta-канал для тестов; в браузере —
 * import.meta.env): undefined трактуется как «dev» (тестовые подмены window.meta
 * без DEV не должны случайно включать прод-поведение).
 */
export function mockModeAllowed(): boolean {
  const env = readInjectedEnv() as Record<string, unknown>;
  const dev = env.DEV === undefined ? true : (env.DEV === true || env.DEV === 'true');
  if (dev) return true;
  return env.VITE_ENABLE_MOCK === 'true' || env.VITE_ENABLE_MOCK === true;
}

export class ModeResolver {
  private mode: ApiMode = 'mock';
  private modeResolved = false;
  private resolvePromise: Promise<void> | null = null;

  constructor() {
    const env = readInjectedEnv();
    const storedMode = localStorage.getItem(LS_MODE_KEY) as ApiMode | null;
    const envMode = env.VITE_API_MODE as ApiMode | undefined;
    const allowMock = mockModeAllowed();

    if (storedMode === 'real') {
      this.mode = 'real';
      this.modeResolved = true;
    } else if (storedMode === 'mock' && allowMock) {
      // transparency-п.4: «mock» из localStorage в прод-сборке игнорируется
      this.mode = 'mock';
      this.modeResolved = true;
    } else if (envMode === 'mock' && allowMock) {
      this.mode = 'mock';
      this.modeResolved = true;
    } else if (envMode === 'real') {
      this.mode = 'real';
      this.modeResolved = true;
    } else {
      this.mode = allowMock ? 'mock' : 'real'; // default (прод — всегда real)
    }

    // Проверка seedVersion
    const storedSeed = localStorage.getItem(LS_SEED_KEY);
    if (storedSeed !== SEED_VERSION) {
      localStorage.setItem(LS_SEED_KEY, SEED_VERSION);
      // При смене версии сида можно очистить данные
    }
  }

  getMode(): ApiMode {
    return this.mode;
  }

  isResolved(): boolean {
    return this.modeResolved;
  }

  async resolveMode(baseUrl: string): Promise<ApiMode> {
    if (this.modeResolved) return this.mode;
    if (this.resolvePromise) return this.resolvePromise.then(() => this.mode);

    // transparency-п.4 (вариант A): в прод-сборке без VITE_ENABLE_MOCK авто-пинг
    // не может «уронить» приложение в mock — режим всегда real; недоступность
    // бэкенда обрабатывают error-состояния страниц («Повторить»).
    if (!mockModeAllowed()) {
      this.mode = 'real';
      this.modeResolved = true;
      localStorage.setItem(LS_MODE_KEY, 'real');
      return this.mode;
    }

    this.resolvePromise = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 700);

        const response = await fetch(`${baseUrl}/meta`, {
          signal: controller.signal,
          method: 'GET'
        });
        clearTimeout(timeout);

        // Fix-11 (Vercel): «real» ТОЛЬКО если это действительно JSON-API.
        // На статическом хостинге с SPA-rewrite /api/v1/meta может вернуть
        // 200 + index.html — без проверки content-type режим ошибочно
        // становился 'real' и всё приложение ломалось (каждый запрос — HTML).
        const contentType = response.headers.get('content-type') ?? '';
        if (response.ok && contentType.includes('json')) {
          this.mode = 'real';
        } else {
          this.mode = 'mock';
        }
      } catch {
        this.mode = 'mock';
      } finally {
        this.modeResolved = true;
        localStorage.setItem(LS_MODE_KEY, this.mode);
      }
    })();

    await this.resolvePromise;
    return this.mode;
  }

  setMode(mode: ApiMode) {
    if (mode === 'mock' && !mockModeAllowed()) {
      // R10: попытка переключения видна в логе; прод-сборка остаётся на real
      console.warn('[mode] Демо-режим отключён в этой сборке (нет VITE_ENABLE_MOCK) — остаётся real');
      return;
    }
    this.mode = mode;
    this.modeResolved = true;
    localStorage.setItem(LS_MODE_KEY, mode);
  }

  resetSeedData() {
    localStorage.removeItem(LS_SEED_KEY);
    localStorage.removeItem('mockData');
    localStorage.setItem(LS_SEED_KEY, SEED_VERSION);
  }
}
