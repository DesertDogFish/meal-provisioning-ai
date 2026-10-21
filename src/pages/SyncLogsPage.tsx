import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/ToastProvider';
import { RefreshCw, X, AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

interface SyncLog {
  id: number;
  provider: string;
  type: string;
  status: string;
  triggeredBy: string;
  triggeredUserEmail: string;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  details: {
    requestCount: number;
    items: SyncItem[];
    errors: SyncError[];
  } | null;
}

interface SyncItem {
  productId: number;
  productName: string;
  externalCode: string;
  priceDate: string;
  oldPrice: number | null;
  newPrice: number | null;
  action: string;
  reason: string | null;
  anomaly: boolean;
}

interface SyncError {
  externalCode: string;
  message: string;
}

interface Kpi {
  totalRuns: number;
  successRate: number;
  totalUpdated: number;
  totalErrors: number;
}

export default function SyncLogsPage() {
  const { state } = useApp();
  const { showError, showSuccess } = useToast();
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);
  
  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    loadSyncLogs();
    loadKpi();
  }, [filterType, filterStatus, filterFrom, filterTo]);

  // Polling for RUNNING status
  useEffect(() => {
    const hasRunning = syncLogs.some(log => log.status === 'RUNNING');
    if (hasRunning) {
      const interval = setInterval(() => {
        loadSyncLogs();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [syncLogs]);

  const loadSyncLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.append('type', filterType);
      if (filterStatus) params.append('status', filterStatus);
      if (filterFrom) params.append('from', filterFrom);
      if (filterTo) params.append('to', filterTo);

      const response = await fetch(`/api/v1/admin/sync-logs?${params}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSyncLogs(data);
      }
    } catch (error) {
      console.error('Failed to load sync logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadKpi = async () => {
    try {
      const response = await fetch('/api/v1/admin/sync-logs/kpi?days=7', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setKpi(data);
      }
    } catch (error) {
      console.error('Failed to load KPI:', error);
    }
  };

  const startSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/v1/admin/integrations/OFF/sync/prices', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });

      if (response.ok) {
        showSuccess('Синк запущен');
        await loadSyncLogs();
      } else {
        const error = await response.json();
        if (error.status === 409) {
          showError(error.detail || 'Синк уже запущен');
        } else {
          showError(error.detail || 'Ошибка запуска синка');
        }
      }
    } catch (error) {
      showError('Ошибка сети');
    } finally {
      setSyncing(false);
    }
  };

  const resetFilters = () => {
    setFilterType('');
    setFilterStatus('');
    setFilterFrom('');
    setFilterTo('');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU');
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '—';
    return `${seconds.toFixed(1)} с`;
  };

  const getStatusChip = (status: string) => {
    const styles = {
      SUCCESS: { background: 'rgba(52, 211, 153, 0.16)', color: '#7EE2B8' },
      FAILED: { background: 'rgba(248, 113, 113, 0.16)', color: '#FCA5A5' },
      RUNNING: { background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' }
    };
    return (
      <span className="chip-delta" style={styles[status as keyof typeof styles]}>
        {status === 'RUNNING' && <span className="animate-pulse">●</span>} {status}
      </span>
    );
  };

  const getActionChip = (action: string) => {
    const styles: Record<string, { background: string; color: string }> = {
      UPDATED: { background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' },
      CREATED: { background: 'rgba(52, 211, 153, 0.16)', color: '#7EE2B8' },
      SKIPPED_MANUAL: { background: 'rgba(45, 212, 191, 0.14)', color: '#8FE8DC' },
      SKIPPED_CURRENCY: { background: 'rgba(255, 255, 255, 0.07)', color: 'var(--muted)' },
      ERROR: { background: 'rgba(248, 113, 113, 0.16)', color: '#FCA5A5' }
    };
    return (
      <span className="chip-delta" style={styles[action]}>
        {action}
      </span>
    );
  };

  const lastFailed = syncLogs.length > 0 && syncLogs[0].status === 'FAILED';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Журнал синков</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          История синхронизаций с внешними источниками
        </p>
      </div>

      {/* Provider Card */}
      <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--ok)' }}></div>
            <b style={{ color: 'var(--text)' }}>Open Food Facts · Open Prices</b>
          </div>
          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
            подключён 20.10.2026 18:04 · последний синк 21.10.2026 06:00
          </span>
          <div style={{ flex: 1 }}></div>
          <button
            onClick={startSync}
            disabled={syncing}
            className="grad-btn flex items-center gap-2"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Синк идёт...' : 'Обновить цены'}
          </button>
        </div>
      </div>

      {/* KPI Chips */}
      {kpi && (
        <div className="flex gap-3 flex-wrap">
          <div className="chip-delta dim">
            запусков за 7 дней: {kpi.totalRuns}
          </div>
          <div className="chip-delta" style={{ background: 'rgba(52, 211, 153, 0.16)', color: '#7EE2B8' }}>
            успешность: {kpi.successRate.toFixed(0)}%
          </div>
          <div className="chip-delta" style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' }}>
            обновлено строк: {kpi.totalUpdated}
          </div>
          <div className="chip-delta fire">
            ошибок: {kpi.totalErrors}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-3 items-center flex-wrap">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-4 py-2.5 rounded-lg outline-none"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Тип: все</option>
          <option value="PRICES">PRICES</option>
          <option value="CATALOG">CATALOG</option>
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 rounded-lg outline-none"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Статус: все</option>
          <option value="RUNNING">RUNNING</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="FAILED">FAILED</option>
        </select>

        <input
          type="date"
          value={filterFrom}
          onChange={e => setFilterFrom(e.target.value)}
          className="px-4 py-2.5 rounded-lg outline-none"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />

        <input
          type="date"
          value={filterTo}
          onChange={e => setFilterTo(e.target.value)}
          className="px-4 py-2.5 rounded-lg outline-none"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />

        <button onClick={resetFilters} className="ghost-btn">
          Сбросить
        </button>
      </div>

      {/* Error Banner */}
      {lastFailed && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.4)'
        }}>
          <AlertCircle size={20} style={{ color: '#F8C468' }} />
          <span style={{ color: '#F8C468', fontSize: '13px' }}>
            Последний запуск упал: {syncLogs[0].details?.errors?.[0]?.message || 'Неизвестная ошибка'}
          </span>
          <div style={{ flex: 1 }}></div>
          <button onClick={startSync} className="ghost-btn">
            Повторить
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div className="p-12 text-center" style={{ color: 'var(--muted)' }}>Загрузка...</div>
        ) : syncLogs.length === 0 ? (
          <div className="p-12 text-center">
            <p style={{ color: 'var(--muted)' }}>Ничего не найдено</p>
            <button onClick={resetFilters} className="ghost-btn mt-4">Сбросить фильтры</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--elev)' }}>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Старт</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Длит.</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Тип</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Триггер</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Статус</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Создано</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Обновлено</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Ошибки</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {syncLogs.map(log => (
                <tr key={log.id} style={{ borderTop: '1px solid var(--border)' }} className={log.status === 'RUNNING' ? 'animate-pulse' : ''}>
                  <td className="px-4 py-3" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDate(log.startedAt)}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDuration(log.durationSeconds)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="chip-delta" style={{
                      background: log.type === 'PRICES' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(255, 255, 255, 0.07)',
                      color: log.type === 'PRICES' ? '#9BD8F5' : 'var(--muted)'
                    }}>
                      {log.type}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                    {log.triggeredBy === 'MANUAL' ? `вручную: ${log.triggeredUserEmail}` : 'планово'}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusChip(log.status)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {log.createdCount}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {log.updatedCount}
                  </td>
                  <td className="px-4 py-3 text-right" style={{
                    color: log.errorCount > 0 ? 'var(--fire)' : 'var(--text)',
                    fontWeight: log.errorCount > 0 ? 'bold' : 'normal',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {log.errorCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="ghost-btn"
                      style={{ padding: '6px 12px' }}
                    >
                      детали
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setSelectedLog(null)}>
          <div
            className="w-full max-w-2xl h-full overflow-auto p-6"
            style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                Запуск #{selectedLog.id} · {selectedLog.type}
              </h2>
              <button onClick={() => setSelectedLog(null)} className="p-2 rounded-lg hover:bg-white/5">
                <X size={20} style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '14px' }}>
              {formatDate(selectedLog.startedAt)} · {selectedLog.triggeredBy === 'MANUAL' ? `вручную: ${selectedLog.triggeredUserEmail}` : 'планово'} · {formatDuration(selectedLog.durationSeconds)} · запросов к OFF: {selectedLog.details?.requestCount || '—'}
            </p>

            {/* Items */}
            {selectedLog.details?.items && selectedLog.details.items.length > 0 ? (
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left py-2 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Продукт</th>
                    <th className="text-left py-2 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Дата цены</th>
                    <th className="text-left py-2 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Старая → новая</th>
                    <th className="text-left py-2 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLog.details.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2">
                        <b style={{ color: 'var(--text)' }}>{item.productName}</b>
                        {item.anomaly && <span className="chip-delta fire" style={{ marginLeft: '8px' }}>⚑</span>}
                        <div style={{ color: 'var(--muted)', fontSize: '11px' }}>{item.externalCode}</div>
                      </td>
                      <td className="py-2" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {item.priceDate}
                      </td>
                      <td className="py-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {item.oldPrice !== null && item.newPrice !== null ? (
                          <>
                            {item.oldPrice.toFixed(2)}
                            <span style={{ color: 'var(--muted)', padding: '0 6px' }}>→</span>
                            <b style={{ color: item.newPrice > item.oldPrice ? '#FCA5A5' : '#7EE2B8' }}>
                              {item.newPrice.toFixed(2)}
                            </b>
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td className="py-2">
                        {getActionChip(item.action)}
                        {item.reason && (
                          <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '4px' }}>
                            {item.reason}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'var(--muted)' }}>Постатейных данных нет.</p>
            )}

            {/* Errors */}
            {selectedLog.details?.errors && selectedLog.details.errors.length > 0 && (
              <div className="mt-4">
                <b style={{ color: 'var(--muted)', fontSize: '12px' }}>Ошибки</b>
                {selectedLog.details.errors.map((err, idx) => (
                  <div key={idx} className="chip-delta fire" style={{ display: 'block', marginTop: '6px' }}>
                    {err.externalCode} · {err.message}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button onClick={startSync} className="grad-btn flex-1">
                Повторить запуск
              </button>
              <button onClick={() => setSelectedLog(null)} className="ghost-btn flex-1">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
