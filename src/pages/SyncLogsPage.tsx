import { useState, useEffect } from 'react';
import { useToast } from '../components/ToastProvider';
import { DatePicker } from '../components/DatePicker';
import Modal from '../components/Modal';
import { RefreshCw, X, AlertCircle } from 'lucide-react';
import { api, ApiClientError } from '../api/client';
import { Button } from '../components/Button';

import PageLoader from '../components/PageLoader';
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
    // Fix-15: фатальная ошибка запуска (вне цикла маппингов) — бэкенд пишет её
    // в details.fatalError; drawer обязан её показывать.
    fatalError?: string | null;
  } | null;
}

// Fix-15: карточка провайдера — реальные данные интеграции вместо фейка
interface IntegrationInfo {
  provider: string;
  status: string;
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
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
  const { showError, showSuccess } = useToast();
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);
  // Fix-15: интеграция Росстата для карточки провайдера (статус/даты — живые)
  const [integration, setIntegration] = useState<IntegrationInfo | null>(null);
  
  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    loadSyncLogs();
    loadKpi();
    loadIntegration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus, filterFrom, filterTo]);

  // Polling for RUNNING status (Fix-15: заодно обновляем карточку провайдера —
  // lastSyncAt оживает без F5)
  useEffect(() => {
    const hasRunning = syncLogs.some(log => log.status === 'RUNNING');
    if (hasRunning) {
      const interval = setInterval(() => {
        loadSyncLogs();
        loadIntegration();
      }, 2000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncLogs]);

  const loadSyncLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;

      const data = await api.get<SyncLog[]>('/admin/sync-logs', { params });
      setSyncLogs(data);
    } catch (error) {
      console.error('Failed to load sync logs:', error);
      setSyncLogs([]);
      if (error instanceof ApiClientError && error.error.status === 403) {
        showError('Нет прав для просмотра журнала синков');
      } else {
        showError('Не удалось загрузить журнал синков');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadKpi = async () => {
    try {
      const data = await api.get<Kpi>('/admin/sync-logs/kpi', { params: { days: '7' } });
      setKpi(data);
    } catch (error) {
      console.error('Failed to load KPI:', error);
      setKpi(null);
      if (error instanceof ApiClientError && error.error.status === 403) {
        showError('Нет прав для просмотра журнала синков');
      } else {
        showError('Не удалось загрузить KPI синхронизаций');
      }
    }
  };

  // Fix-15: карточка провайдера — живой статус Росстата из /admin/integrations
  const loadIntegration = async () => {
    try {
      const data = await api.get<IntegrationInfo[]>('/admin/integrations');
      setIntegration(Array.isArray(data) ? data.find(i => i.provider === 'ROSSTAT') ?? null : null);
    } catch (error) {
      console.error('Failed to load integration info:', error);
      setIntegration(null);
    }
  };

  const startSync = async () => {
    setSyncing(true);
    try {
      // Fix-15: единственный провайдер — Росстат (ЕМИСС); запуск идёт именно в него.
      await api.post('/admin/integrations/ROSSTAT/sync/prices');
      showSuccess('Синк запущен');
      await loadSyncLogs();
      await loadIntegration();
    } catch (error) {
      console.error('Failed to start sync:', error);
      if (error instanceof ApiClientError && error.error.status === 409) {
        // Оба конфликта — 409; различаем по коду в сообщении бэкенда
        const detail = `${error.error.detail || ''} ${error.error.title || ''}`;
        if (detail.includes('SYNC_ALREADY_RUNNING')) {
          showError('Синхронизация уже запущена, подожди завершения');
        } else {
          showError('Интеграция не подключена — сначала подключите её на странице «Интеграции»');
        }
      } else if (error instanceof ApiClientError && error.error.status === 403) {
        showError('Нет прав для запуска синхронизации');
      } else {
        showError('Не удалось запустить синхронизацию');
      }
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
      SUCCESS: { background: 'var(--success-soft)', color: 'var(--wave-300)' },
      // Fix-15: PARTIAL — запуск с ошибками, но часть работы выполнена (янтарный)
      PARTIAL: { background: 'color-mix(in srgb, var(--amber-500) 14%, transparent)', color: 'var(--amber-300)' },
      FAILED: { background: 'var(--danger-soft)', color: 'var(--danger)' },
      RUNNING: { background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }
    };
    return (
      <span className="chip-delta" style={styles[status as keyof typeof styles]}>
        {status === 'RUNNING' && <span className="animate-pulse">●</span>} {status}
      </span>
    );
  };

  /**
   * Чип действия по продукту (SyncDetailsBuilder): CREATED / UPDATED / SKIPPED / ERROR.
   * SKIPPED_MANUAL больше не существует — синхронизация ЕМИСС перезаписывает любые цены
   * привязанных продуктов, включая ручные (EmisPriceApplier).
   */
  const getActionChip = (action: string) => {
    const styles: Record<string, { background: string; color: string }> = {
      UPDATED: { background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' },
      CREATED: { background: 'var(--success-soft)', color: 'var(--wave-300)' },
      // SKIPPED — у позиции ЕМИСС нет цен или единицы несовместимы (не ошибка)
      SKIPPED: { background: 'color-mix(in srgb, var(--line-strong) 28%, transparent)', color: 'var(--muted)' },
      ERROR: { background: 'var(--danger-soft)', color: 'var(--danger)' }
    };
    // Исторические запуски могли содержать действия удалённых провайдеров —
    // рисуем их нейтральным чипом вместо undefined-стиля.
    const style = styles[action]
      ?? { background: 'color-mix(in srgb, var(--line-strong) 28%, transparent)', color: 'var(--muted)' };
    return (
      <span className="chip-delta" style={style}>
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

      {/* Provider Card — Fix-15: живые данные интеграции вместо захардкоженных дат */}
      <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{
              background: integration?.status === 'CONNECTED' ? 'var(--ok)'
                : integration?.status === 'ERROR' ? 'var(--fire)' : 'var(--muted)'
            }}></div>
            <b style={{ color: 'var(--text)' }}>Росстат (ЕМИСС)</b>
          </div>
          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
            {integration?.status === 'CONNECTED'
              ? `подключён ${integration.lastConnectedAt ? formatDate(integration.lastConnectedAt) : '—'}`
                + ` · последний синк ${integration.lastSyncAt ? formatDate(integration.lastSyncAt) : '—'}`
              : integration?.status === 'ERROR'
                ? `ошибка подключения${integration.errorMessage ? `: ${integration.errorMessage}` : ''}`
                : 'не подключён — включите интеграцию на странице «Интеграции»'}
          </span>
          <div style={{ flex: 1 }}></div>
          <Button
            variant="primary"
            onClick={startSync}
            loading={syncing}
            disabled={integration?.status !== 'CONNECTED'}
            icon={<RefreshCw size={16} />}
          >
            {syncing ? 'Синк идёт...' : 'Обновить цены'}
          </Button>
        </div>
      </div>

      {/* KPI Chips */}
      {kpi && (
        <div className="flex gap-3 flex-wrap">
          <div className="chip-delta dim">
            запусков за 7 дней: {kpi.totalRuns}
          </div>
          <div className="chip-delta" style={{ background: 'var(--success-soft)', color: 'var(--wave-300)' }}>
            успешность: {kpi.successRate.toFixed(0)}%
          </div>
          <div className="chip-delta" style={{ background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }}>
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
          <option value="PARTIAL">PARTIAL</option>
          <option value="FAILED">FAILED</option>
        </select>

        <DatePicker value={filterFrom || null} onChange={(v) => setFilterFrom(v)} placeholder="С" />
        <DatePicker value={filterTo || null} onChange={(v) => setFilterTo(v)} placeholder="По" />
        <Button variant="ghost" onClick={resetFilters}>
          Сбросить
        </Button>
      </div>

      {/* Error Banner */}
      {lastFailed && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{
          background: 'color-mix(in srgb, var(--amber-500) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--amber-500) 40%, transparent)'
        }}>
          <AlertCircle size={20} style={{ color: 'var(--amber-300)' }} />
          <span style={{ color: 'var(--amber-300)', fontSize: '13px' }}>
            Последний запуск упал: {syncLogs[0].details?.errors?.[0]?.message || 'Неизвестная ошибка'}
          </span>
          <div style={{ flex: 1 }}></div>
          <Button variant="ghost" onClick={startSync}>
            Повторить
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {loading ? (
          <PageLoader />
        ) : syncLogs.length === 0 ? (
          <div className="p-12 text-center">
            <p style={{ color: 'var(--muted)' }}>Ничего не найдено</p>
            <Button variant="ghost" onClick={resetFilters} className="mt-4">Сбросить фильтры</Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--elev)' }}>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Старт</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Длит.</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Тип</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Триггер</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Статус</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Создано</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Обновлено</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Ошибки</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Действия</th>
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
                      background: log.type === 'PRICES' ? 'color-mix(in srgb, var(--wave-400) 14%, transparent)' : 'color-mix(in srgb, var(--line-strong) 28%, transparent)',
                      color: log.type === 'PRICES' ? 'var(--wave-300)' : 'var(--muted)'
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
                    <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                      детали
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer */}
      {selectedLog && (
        <Modal onClose={() => setSelectedLog(null)}>
          <div
            /* Подзадача 4: «drawer» журнала — тоже лист модалки: на телефоне он
               центрирован и ограничен по высоте экрана (min(86dvh)), а не h-full. */
            className="modal-sheet rounded-2xl w-full max-w-2xl overflow-auto p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
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
              {formatDate(selectedLog.startedAt)} · {selectedLog.triggeredBy === 'MANUAL' ? `вручную: ${selectedLog.triggeredUserEmail}` : 'планово'} · {formatDuration(selectedLog.durationSeconds)} · запросов к источнику: {selectedLog.details?.requestCount ?? '—'}
            </p>

            {/* Fix-15: фатальная ошибка запуска — первым блоком, чтобы причина
                сбоя была видна сразу («где детали ошибок?») */}
            {selectedLog.details?.fatalError && (
              <div
                className="chip-delta fire"
                style={{ display: 'block', marginBottom: '12px' }}
                title={selectedLog.details.fatalError}
              >
                <b>Фатальная ошибка:</b> {selectedLog.details.fatalError}
              </div>
            )}

            {/* Items */}
            {selectedLog.details?.items && selectedLog.details.items.length > 0 ? (
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left py-2 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Продукт</th>
                    <th className="text-left py-2 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Дата цены</th>
                    <th className="text-left py-2 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Старая → новая</th>
                    <th className="text-left py-2 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLog.details.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2">
                        <b style={{ color: 'var(--text)' }}>{item.productName}</b>
                        {item.anomaly && <span className="chip-delta fire" style={{ marginLeft: '8px' }}>⚑</span>}
                        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>{item.externalCode}</div>
                      </td>
                      <td className="py-2" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {item.priceDate}
                      </td>
                      <td className="py-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {item.oldPrice !== null && item.newPrice !== null ? (
                          <>
                            {item.oldPrice.toFixed(2)}
                            <span style={{ color: 'var(--muted)', padding: 'var(--sp-1) var(--sp-2)' }}>→</span>
                            <b style={{ color: item.newPrice > item.oldPrice ? 'var(--danger)' : 'var(--wave-300)' }}>
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
                          <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)', marginTop: '4px' }}>
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
                  /* Fix-11 (п.9): длинные сообщения (legacy-записи с HTML-дампами
                     OFF) режем до 160 символов; полный текст — в title. */
                  <div
                    key={idx}
                    className="chip-delta fire"
                    style={{ display: 'block', marginTop: '6px' }}
                    title={err.message}
                  >
                    {err.externalCode} · {err.message && err.message.length > 160
                      ? `${err.message.slice(0, 160)}…`
                      : err.message}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <Button variant="primary" onClick={startSync} className="flex-1">
                Повторить запуск
              </Button>
              <Button variant="ghost" onClick={() => setSelectedLog(null)} className="flex-1">
                Закрыть
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
