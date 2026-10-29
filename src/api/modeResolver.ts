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

export class ModeResolver {
  private mode: ApiMode = 'mock';
  private modeResolved = false;
  private resolvePromise: Promise<void> | null = null;

  constructor() {
    const env = readInjectedEnv();
    const storedMode = localStorage.getItem(LS_MODE_KEY) as ApiMode | null;
    const envMode = env.VITE_API_MODE as ApiMode | undefined;

    if (storedMode === 'mock' || storedMode === 'real') {
      this.mode = storedMode;
      this.modeResolved = true;
    } else if (envMode === 'mock' || envMode === 'real') {
      this.mode = envMode;
      this.modeResolved = true;
    } else {
      this.mode = 'mock'; // default
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
