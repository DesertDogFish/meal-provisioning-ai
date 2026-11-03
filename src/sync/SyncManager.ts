import { syncQueue } from './SyncQueue';
import { networkMonitor } from './NetworkMonitor';
import { notifyConcurrentModification } from '../api/conflictSignal';

export class SyncManager {
  private isSyncing = false;

  async syncAll(): Promise<void> {
    if (this.isSyncing || !networkMonitor.isOnline()) return;
    this.isSyncing = true;
    try {
      const items = await syncQueue.getAll();
      for (const item of items) {
        try {
          // Отправка на сервер через api
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
        } catch (err) {
          const status = (err as any)?.status ?? (err as any)?.error?.status;
          if (status === 409) notifyConcurrentModification();
          await syncQueue.incrementRetry(item.id, String(err));
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  startAutoSync() {
    networkMonitor.subscribe((online) => {
      if (online) this.syncAll();
    });
    // периодическая синхронизация каждые 5 минут
    setInterval(() => this.syncAll(), 5 * 60 * 1000);
  }
}

export const syncManager = new SyncManager();