/**
 * Watchdog для мониторинга доступности API
 * Пингует /api/v1/meta каждые 60 секунд в режимах AUTO и API
 */

import { api } from './client';

type WatchdogCallback = (available: boolean, latencyMs: number | null, error: string | null) => void;

let watchdogInterval: number | null = null;
let callbacks: WatchdogCallback[] = [];
let lastAvailable = false;

export function startWatchdog(intervalMs = 60000): void {
  if (watchdogInterval !== null) return;
  
  // Первоначальный пинг
  pingApi();
  
  // Запуск периодического пинга
  watchdogInterval = window.setInterval(pingApi, intervalMs);
}

export function stopWatchdog(): void {
  if (watchdogInterval !== null) {
    window.clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

export function onWatchdogChange(callback: WatchdogCallback): () => void {
  callbacks.push(callback);
  return () => {
    callbacks = callbacks.filter(cb => cb !== callback);
  };
}

async function pingApi(): Promise<void> {
  const mode = api.getMode();
  
  // Watchdog работает только в режимах AUTO и API
  if (mode === 'mock') {
    return;
  }
  
  const startTime = Date.now();
  
  try {
    await api.get('/meta');
    const latencyMs = Date.now() - startTime;
    
    const wasUnavailable = !lastAvailable;
    lastAvailable = true;
    
    // Уведомляем callbacks
    callbacks.forEach(cb => cb(true, latencyMs, null));
    
    // Если API стал доступен после недоступности
    if (wasUnavailable) {
      // Можно показать тост "API снова доступен"
      console.log('[Watchdog] API is back online');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    lastAvailable = false;
    
    // Уведомляем callbacks
    callbacks.forEach(cb => cb(false, null, errorMessage));
    
    // transparency-п.4 (вариант A): фолбэка на mock нет — недоступность видна
    // в error-состояниях страниц («Повторить»); watchdog лишь логирует факт (R10).
    console.warn('[Watchdog] API unavailable');
  }
}

export function getLastAvailability(): boolean {
  return lastAvailable;
}
