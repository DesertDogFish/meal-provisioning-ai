import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

/** Запуск синхронизации в форме SyncLogDto (GET /admin/integrations/sync-logs). */
export interface SyncLogEntry {
  id: number;
  provider: string;
  type: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
}

/**
 * Короткий журнал запусков прямо в разделе «Интеграции» (полная история — в
 * «Журнале синков»). Показывает статус и счётчики, чтобы результат синхронизации
 * или ручной загрузки файла был виден без перехода на другую страницу.
 */
export function IntegrationSyncLogs({ logs, limit = 10 }: { logs: SyncLogEntry[]; limit?: number }) {
  if (logs.length === 0) return null;
  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
        Журнал синхронизаций
      </h3>
      <div className="space-y-2">
        {logs.slice(0, limit).map(log => (
          <div
            key={log.id}
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              {log.status === 'SUCCESS' ? (
                <CheckCircle size={20} style={{ color: 'var(--ok)' }} />
              ) : log.status === 'FAILED' ? (
                <XCircle size={20} style={{ color: 'var(--fire)' }} />
              ) : log.status === 'PARTIAL' ? (
                /* Fix-15: завершено с ошибками, но часть работы выполнена */
                <AlertCircle size={20} style={{ color: 'var(--amber-300, var(--fire))' }} />
              ) : (
                <AlertCircle size={20} style={{ color: 'var(--muted)' }} />
              )}
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {log.type} - {log.status}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {new Date(log.startedAt).toLocaleString('ru-RU')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Создано: {log.createdCount} • Обновлено: {log.updatedCount} • Ошибок: {log.errorCount}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default IntegrationSyncLogs;
