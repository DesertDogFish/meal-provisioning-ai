/**
 * Настройки автосинхронизации (просьба владельца 07.11.2026): синк раз в 5 минут
 * по умолчанию, интервал настраивается, автосинк можно выключить.
 *
 * Храним в localStorage — настройка переживает перезапуск приложения и не требует
 * бэкенда (сам синк всё равно работает только при наличии сети).
 */
export interface SyncSettings {
  /** автосинк включён */
  enabled: boolean;
  /** интервал в минутах (только из SYNC_INTERVALS_MIN) */
  intervalMin: number;
}

/** 0 = «выключено» (в UI это отдельный пункт списка). */
export const SYNC_INTERVALS_MIN = [0, 1, 5, 10, 15, 30] as const;

export const DEFAULT_SYNC_SETTINGS: SyncSettings = { enabled: true, intervalMin: 5 };

const STORAGE_KEY = 'pv.sync.settings';

const listeners = new Set<(s: SyncSettings) => void>();

function normalize(raw: Partial<SyncSettings> | null | undefined): SyncSettings {
  const enabled = raw?.enabled !== false;
  const rawMin = Number(raw?.intervalMin);
  const intervalMin = SYNC_INTERVALS_MIN.includes(rawMin as (typeof SYNC_INTERVALS_MIN)[number])
    ? rawMin
    : DEFAULT_SYNC_SETTINGS.intervalMin;
  // «0 минут» = автосинк выключен, даже если enabled остался true
  return { enabled: enabled && intervalMin > 0, intervalMin: intervalMin > 0 ? intervalMin : DEFAULT_SYNC_SETTINGS.intervalMin };
}

function read(): SyncSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SYNC_SETTINGS };
    return normalize(JSON.parse(raw) as Partial<SyncSettings>);
  } catch {
    return { ...DEFAULT_SYNC_SETTINGS };
  }
}

let current: SyncSettings = read();

export function getSyncSettings(): SyncSettings {
  return { ...current };
}

export function setSyncSettings(patch: Partial<SyncSettings>): SyncSettings {
  current = normalize({ ...current, ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* приватный режим / нет localStorage — настройка живёт до перезапуска */
  }
  listeners.forEach((l) => l(getSyncSettings()));
  return getSyncSettings();
}

export function subscribeSyncSettings(cb: (s: SyncSettings) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Для тестов: сбросить к дефолту (5 минут, включено). */
export function resetSyncSettings(): void {
  current = { ...DEFAULT_SYNC_SETTINGS };
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l(getSyncSettings()));
}
