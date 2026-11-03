/**
 * Интеграции: единственный провайдер — Росстат (ЕМИСС).
 *
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.2/п.3): ОДИН раздел вместо
 * трёх витрин — табы «Настройка | Журнал синков | Импорт каталога»:
 *  - «Настройка» — статус провайдера (единственная витрина статуса), подключение,
 *    ЕДИНСТВЕННАЯ кнопка запуска синка и ручная загрузка SDMX (`EmisSettingsTab`);
 *  - «Журнал синков» — полный журнал с фильтрами/KPI/деталями, переехал со
 *    страницы `SyncLogsPage` (`SyncLogsTab`); роут `/sync-logs` редиректит на
 *    `/integrations?tab=logs` (deep-links из тостов/доков не ломаются);
 *  - «Импорт каталога» — стагинг approve/reject, переехал с демонтированной
 *    страницы-сироты `/admin` (`CatalogImportTab`); `/admin` → редирект сюда.
 * Таб живёт в URL (?tab=) — ссылкой попадаем в нужный таб, e2e детерминированы.
 *
 * Ручная привязка товаров отсюда убрана (боль запусков №14–17): продукт связывается
 * с позицией ЕМИСС в своём же редакторе («Продукты» → «Источник цены») — ссылка там.
 */
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { api } from '../api/client';
import EmisSettingsTab, { formatFileSize, type IntegrationInfo } from '../components/EmisSettingsTab';
import SyncLogsTab from '../components/SyncLogsTab';
import CatalogImportTab from '../components/CatalogImportTab';

/** Запуск синхронизации в короткой форме SyncLogDto (GET /admin/integrations/sync-logs)
 * — нужен только для поллинга watchedLogId; полный журнал — в SyncLogsTab. */
interface SyncLogEntry {
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

/** Лимит совпадает с бэкендом: spring.servlet.multipart.max-file-size (EMIS_UPLOAD_MAX_FILE_SIZE)
 * и с client_max_body_size в nginx.conf — полная SDMX-выгрузка весит ~65 МБ. */
const MAX_UPLOAD_BYTES = 96 * 1024 * 1024;

type IntegrationsTab = 'settings' | 'logs' | 'import';

function parseTab(raw: string | null): IntegrationsTab {
  return raw === 'logs' || raw === 'import' ? raw : 'settings';
}

const TABS: Array<{ id: IntegrationsTab; label: string }> = [
  { id: 'settings', label: 'Настройка' },
  { id: 'logs', label: 'Журнал синков' },
  { id: 'import', label: 'Импорт каталога' },
];

export default function IntegrationsPage() {
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState<IntegrationsTab>(() => parseTab(searchParams.get('tab')));

  const setTab = (t: IntegrationsTab) => {
    setTabState(t);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', t);
      return next;
    }, { replace: true });
  };

  // FIX: корректное извлечение детали ошибки из ApiClientError.
  const extractErrorMessage = (error: any): string =>
    error?.error?.detail ?? error?.detail ?? error?.message ?? 'Неизвестная ошибка';

  // FIX: ProblemDetail со свойством "type" приходит и при успехе — ошибкой
  // считаем только HTTP 4xx/5xx (у ApiClientError есть error.status).
  const isFailureEnvelope = (response: any): boolean =>
    response != null && typeof response === 'object' &&
    typeof response.status === 'number' && response.status >= 400;

  const handleApiError = (error: any, fallback: string) => {
    const msg = extractErrorMessage(error);
    if (/not connected|Provider is not connected/i.test(msg)) {
      showError('Интеграция не подключена — сначала подключите её, чтобы обновлять цены');
      return;
    }
    showError(msg || fallback);
  };

  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Fix-15: id запуска, за которым следим после «Обновить цены»/загрузки файла
  const [watchedLogId, setWatchedLogId] = useState<number | null>(null);

  useEffect(() => {
    void loadIntegrations();
    void loadSyncLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIntegrations = async () => {
    try {
      const data = await api.get<IntegrationInfo[]>('/admin/integrations');
      setIntegrations(data);
    } catch (error) {
      // R10: сбой загрузки виден в логе и тостом; устаревший список сбрасываем
      console.error('Failed to load integrations:', error);
      setIntegrations([]);
      showError('Не удалось загрузить список интеграций');
    }
  };

  const loadSyncLogs = async () => {
    try {
      const data = await api.get<SyncLogEntry[]>('/admin/integrations/sync-logs');
      setSyncLogs(data);
    } catch (error) {
      console.error('Failed to load sync logs:', error);
      setSyncLogs([]);
      showError('Не удалось загрузить журнал синков');
    }
  };

  // Fix-13: единственная интеграция — Росстат (ЕМИСС)
  const rosstatIntegration = integrations.find(i => i.provider === 'ROSSTAT');
  // Fix-15: пока фон не завершился — кнопки запуска держим занятыми
  const hasRunningSync = syncLogs.some(l => l.status === 'RUNNING');

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await api.post<any>('/admin/integrations/ROSSTAT/connect');
      const failedByStatus = result?.status === 'ERROR' || result?.available === false;
      if (failedByStatus) {
        showError(`Ошибка: ${result?.errorMessage || extractErrorMessage(result) || 'Неизвестная ошибка'}`);
      } else if (isFailureEnvelope(result)) {
        showError(`Ошибка: ${extractErrorMessage(result) || 'Неизвестная ошибка'}`);
      } else if (result?.errorMessage && !/^connected successfully$/i.test(result.errorMessage)) {
        showError(`Ошибка: Не удалось подключиться: ${result.errorMessage}`);
      } else {
        showSuccess('Успешно подключено');
      }
      await loadIntegrations();
    } catch (error: any) {
      console.error('Failed to connect:', error);
      handleApiError(error, 'Не удалось подключиться');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const result = await api.post<any>('/admin/integrations/ROSSTAT/disconnect');
      if (isFailureEnvelope(result)) {
        showError(extractErrorMessage(result));
      } else {
        showSuccess('Отключено');
      }
      await loadIntegrations();
    } catch (error: any) {
      console.error('Failed to disconnect:', error);
      handleApiError(error, 'Не удалось отключить');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPrices = async () => {
    setSyncing(true);
    try {
      const result = await api.post<any>('/admin/integrations/ROSSTAT/sync/prices');
      if (isFailureEnvelope(result)) {
        showError(extractErrorMessage(result));
        setSyncing(false);
        return;
      }
      // Fix-15: бэкенд отвечает 202 Accepted + { logId } — синк идёт в фоне.
      showSuccess(
        `Синхронизация цен запущена${result?.logId != null ? ` (задача #${result.logId})` : ''}`
      );
      await loadSyncLogs();
      if (result?.logId != null) setWatchedLogId(result.logId);
      await loadIntegrations();
    } catch (error: any) {
      console.error('Failed to sync prices:', error);
      handleApiError(error, 'Не удалось обновить цены');
      setSyncing(false);
    }
  };

  /** Выбор файла: сразу валидируем пустой/слишком большой. */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size === 0) {
      setSelectedFile(null);
      setFileError('Файл пуст — скачайте выгрузку ЕМИСС заново');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setSelectedFile(null);
      setFileError(`Файл ${formatFileSize(file.size)} — больше лимита ${formatFileSize(MAX_UPLOAD_BYTES)}`);
      return;
    }
    setSelectedFile(file);
  };

  /** Ручная загрузка выгрузки ЕМИСС (POST /admin/integrations/ROSSTAT/upload). */
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setFileError(null);
    try {
      const result = await api.postFile<any>('/admin/integrations/ROSSTAT/upload', selectedFile);
      if (isFailureEnvelope(result)) {
        showError(extractErrorMessage(result));
        setUploading(false);
        return;
      }
      showSuccess(
        `Файл «${selectedFile.name}» принят, цены пересчитываются` +
        `${result?.logId != null ? ` (задача #${result.logId})` : ''}`
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadSyncLogs();
      if (result?.logId != null) setWatchedLogId(result.logId);
      await loadIntegrations();
    } catch (error: any) {
      console.error('Failed to upload snapshot:', error);
      handleApiError(error, 'Не удалось загрузить файл');
      setUploading(false);
    }
  };

  // Fix-15: поллинг журнала и интеграций, пока есть RUNNING-записи
  useEffect(() => {
    if (watchedLogId == null && !syncLogs.some(l => l.status === 'RUNNING')) return;
    const t = setInterval(() => {
      void loadSyncLogs();
      void loadIntegrations();
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncLogs, watchedLogId]);

  // Fix-15: наблюдаемый запуск достиг терминального статуса — честный итог
  useEffect(() => {
    if (watchedLogId == null) return;
    const log = syncLogs.find(l => l.id === watchedLogId);
    if (!log) {
      if (!syncLogs.some(l => l.status === 'RUNNING')) {
        setWatchedLogId(null);
        setSyncing(false);
        setUploading(false);
      }
      return;
    }
    if (log.status === 'RUNNING') return;
    setWatchedLogId(null);
    setSyncing(false);
    setUploading(false);
    const counts = `создано: ${log.createdCount}, обновлено: ${log.updatedCount}, ошибок: ${log.errorCount}`;
    if (log.status === 'SUCCESS') {
      showSuccess(`Синхронизация цен завершена (${counts})`);
    } else if (log.status === 'PARTIAL') {
      showError(`Синхронизация завершилась с ошибками (${counts}) — детали в журнале синков`);
    } else {
      showError(`Синхронизация не удалась (${counts}) — детали в журнале синков`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncLogs, watchedLogId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Интеграции</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Локальная копия ЕМИСС Росстата — источник плановых цен
        </p>
      </div>

      {/* Табы раздела (cleanup-п.2/3): настройка, журнал, импорт каталога */}
      <div className="seg seg-scroll max-w-full overflow-x-auto" role="tablist" aria-label="Разделы интеграций">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`seg-btn whitespace-nowrap ${tab === t.id ? 'active' : ''}`}
            data-testid={`integrations-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' && (
        <EmisSettingsTab
          rosstatIntegration={rosstatIntegration}
          loading={loading}
          syncing={syncing}
          uploading={uploading}
          hasRunningSync={hasRunningSync}
          selectedFile={selectedFile}
          fileError={fileError}
          fileInputRef={fileInputRef}
          maxUploadLabel={formatFileSize(MAX_UPLOAD_BYTES)}
          onConnect={() => void handleConnect()}
          onDisconnect={() => void handleDisconnect()}
          onSyncPrices={() => void handleSyncPrices()}
          onFileChange={handleFileChange}
          onUpload={() => void handleUpload()}
          onClearFile={() => {
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          onOpenLogs={() => setTab('logs')}
        />
      )}

      {tab === 'logs' && <SyncLogsTab onGoToSettings={() => setTab('settings')} />}

      {tab === 'import' && <CatalogImportTab />}
    </div>
  );
}
