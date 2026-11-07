import { notifyConcurrentModification } from '../api/conflictSignal';

import { networkMonitor } from './NetworkMonitor';
import { syncQueue } from './SyncQueue';
import { getSyncSettings, subscribeSyncSettings } from './syncSettings';

export interface SyncRunResult {
  /** успешно отправлено записей */
  sent: number;
  /** осталось в очереди (ошибки/повторы) */
  failed: number;
  /** сколько записей было в очереди на старте */
  total: number;
  /** запуск пропущен: нет сети или уже идёт синхронизация */
  skipped: boolean;
}

export interface SyncState {
  syncing: boolean;
  /** сколько позиций сейчас в локальной очереди */
  pending: number;
  /** время последнего завершённого прогона (ms) */
  lastRunAt: number | null;
  lastSent: number;
  lastFailed: number;
}

/**
 * Очередь офлайн-изменений (IndexedDB) -> сервер.
 *
 * Владелец 07.11.2026: автосинк должен идти сам, раз в 5 минут по умолчанию,
 * с настраиваемым интервалом (`syncSettings`), плюс принудительный запуск
 * кнопкой в боковом меню. До этой правки `startAutoSync()` не вызывался НИГДЕ,
 * поэтому очередь никогда не разбиралась.
 */
export class SyncManager {
  private isSyncing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private unsubscribers: Array<() => void> = [];
  private state: SyncState = { syncing: false, pending: 0, lastRunAt: null, lastSent: 0, lastFailed: 0 };
  private listeners = new Set<(s: SyncState) => void>();

  getState(): SyncState {
    return { ...this.state };
  }

  subscribe(cb: (s: SyncState) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private patch(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    this.listeners.forEach((l) => l(snapshot));
  }

  /** Пересчитать «в очереди N» (для меню/статуса). */
  async refreshPending(): Promise<number> {
    try {
      const items = await syncQueue.getAll();
      this.patch({ pending: items.length });
      return items.length;
    } catch {
      return this.state.pending;
    }
  }

  /** Отправить всё, что накопилось. Существующий контракт: Promise<void>. */
  async syncAll(): Promise<void> {
    await this.runSync();
  }

  /** Принудительный запуск (кнопка в меню) - возвращает статистику для тоста. */
  async forceSync(): Promise<SyncRunResult> {
    return this.runSync();
  }

  private async runSync(): Promise<SyncRunResult> {
    if (this.isSyncing) return { sent: 0, failed: this.state.pending, total: this.state.pending, skipped: true };
    if (!networkMonitor.isOnline()) {
      const pending = await this.refreshPending();
      return { sent: 0, failed: pending, total: pending, skipped: true };
    }
    this.isSyncing = true;
    this.patch({ syncing: true });
    let sent = 0;
    let total = 0;
    try {
      const items = await syncQueue.getAll();
      total = items.length;
      for (const item of items) {
        try {
          const { api } = await import('../api/client');
          const path = `/${item.entityType}s/${item.entityId}`;
          if (item.action === 'create') {
            await api.post(path, item.payload);
          } else if (item.action === 'update') {
            await api.put(path, item.payload);
          } else if (item.action === 'delete') {
            await api.del(path);
          }
          await syncQueue.remove(item.id);
          sent++;
        } catch (err) {
          const status = (err as any)?.status ?? (err as any)?.error?.status;
          if (status === 409) notifyConcurrentModification();
          await syncQueue.incrementRetry(item.id, String(err));
        }
      }
      const failed = await this.refreshPending();
      this.patch({ lastRunAt: Date.now(), lastSent: sent, lastFailed: failed });
      return { sent, failed, total, skipped: false };
    } finally {
      this.isSyncing = false;
      this.patch({ syncing: false });
    }
  }

  /**
   * Запуск автосинка. Идемпотентно: повторный вызов только пересобирает таймер
   * (например, после смены интервала в настройках).
   */
  startAutoSync(): void {
    if (!this.started) {
      this.started = true;
      // Сеть вернулась - сразу досылаем очередь
      this.unsubscribers.push(networkMonitor.subscribe((online) => {
        if (online) void this.syncAll();
      }));
      // Смена интервала/выключение в настройках - пересобираем таймер
      this.unsubscribers.push(subscribeSyncSettings(() => this.rearm()));
      void this.refreshPending();
    }
    this.rearm();
  }

  /** Пересобрать таймер по текущим настройкам. */
  private rearm(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const { enabled, intervalMin } = getSyncSettings();
    if (!enabled || intervalMin <= 0) return;
    this.timer = setInterval(() => { void this.syncAll(); }, intervalMin * 60 * 1000);
  }

  /** Остановить автосинк (logout/тесты). */
  stopAutoSync(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.started = false;
  }
}

export const syncManager = new SyncManager();
