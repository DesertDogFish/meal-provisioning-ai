import { syncQueue } from './SyncQueue';
import { networkMonitor } from './NetworkMonitor';

export class SyncManager {
  private isSyncing = false;

  async syncAll(): Promise<void> {
    if (this.isSyncing || !networkMonitor.isOnline()) return;
    this.isSyncing = true;
    try {
      const items = await syncQueue.getAll();
      for (const item of items) {
        try {
          // TODO: отправить item на сервер через API
          // await api.sync(item);
          await syncQueue.remove(item.id);
        } catch (err) {
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