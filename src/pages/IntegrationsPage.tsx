import { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, RefreshCw, Upload, X, CheckCircle, XCircle, Link, Unlink } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { IntegrationSyncLogs, type SyncLogEntry } from '../components/IntegrationSyncLogs';

interface Integration {
  id: number;
  provider: string;
  status: string;
  baseUrl: string;
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
}

/** Лимит совпадает с бэкендом: spring.servlet.multipart.max-file-size (EMIS_UPLOAD_MAX_FILE_SIZE)
 * и с client_max_body_size в nginx.conf — полная SDMX-выгрузка весит ~65 МБ. */
const MAX_UPLOAD_BYTES = 96 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

/**
 * Интеграции: единственный провайдер — Росстат (ЕМИСС).
 *
 * <p>Ручная привязка товаров отсюда убрана (боль запусков №14–17): продукт связывается
 * с позицией ЕМИСС в своём же редакторе («Продукты» → «Источник цены»), а здесь остаются
 * только способы наполнить локальную копию ЕМИСС — синхронизация с портала и ручная
 * загрузка скачанного файла SDMX (портал закрывается анти-ботом, файл надёжнее).</p>
 */
export default function IntegrationsPage() {
  const { showError, showSuccess } = useToast();

  // FIX: корректное извлечение детали ошибки из ApiClientError.
  // У объекта ошибки нет поля detail — оно лежит в error.error.detail (ProblemDetail),
  // либо это нативная Error с message. Graceful fallback для интеграций.
  const extractErrorMessage = (error: any): string =>
    error?.error?.detail ?? error?.detail ?? error?.message ?? 'Неизвестная ошибка';

  // FIX: бэкенд использует ProblemDetail со свойством "type" (URI, например
  // "about:blank") даже при успешных операциях. Раньше код трактовал наличие
  // type/title как ошибку и показывал "Ошибка: Connected successfully".
  // Ошибкой считаем только HTTP 4xx/5xx (у ApiClientError есть error.status).
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

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Fix-15: id запуска, за которым следим после «Обновить цены»/загрузки файла —
  // поллинг доживает его до терминального статуса и показывает честный итог.
  const [watchedLogId, setWatchedLogId] = useState<number | null>(null);

  useEffect(() => {
    loadIntegrations();
    loadSyncLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIntegrations = async () => {
    try {
      const data = await api.get<Integration[]>('/admin/integrations');
      setIntegrations(data);
    } catch (error) {
      console.error('Failed to load integrations:', error);
      // ЗАДАЧА 3: тост по-русски + сброс устаревшего списка
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
      // ЗАДАЧА 3: пользователь должен видеть сбой загрузки, а UI не должен
      // показывать устаревший список.
      setSyncLogs([]);
      showError('Не удалось загрузить журнал синков');
    }
  };

  // Fix-13: единственная интеграция — Росстат (ЕМИСС); OFF демонтирован
  const rosstatIntegration = integrations.find(i => i.provider === 'ROSSTAT');
  // Fix-15: пока фон не завершился — кнопки запуска держим занятыми
  const hasRunningSync = syncLogs.some(l => l.status === 'RUNNING');

  const handleConnect = async (provider: string) => {
    setLoading(true);
    try {
      const result = await api.post<any>(`/admin/integrations/${provider}/connect`);
      // FIX: раньше здесь было что-то вроде
      //   const errorMsg = result?.message || result?.error;
      //   if (errorMsg) showError('Ошибка: ' + errorMsg);
      // и успешный ответ бэкенда с message="Connected successfully"
      // распознавался как ошибка ("Ошибка: Connected successfully").
      //
      // Теперь явная проверка статуса:
      // - HTTP 2xx доходит сюда (не-ok ответы ApiClient бросает как ApiClientError → catch);
      //   показываем зелёный тост и НЕ берём текст message/detail из тела.
      // - Ошибочные тела (ProblemDetail с status>=400 или IntegrationDto со статусом
      //   ERROR и errorMessage) — это реальные ошибки, их показываем красным.
      const failedByStatus = result?.status === 'ERROR' || result?.available === false;
      if (failedByStatus) {
        // Бэкенд вернул 200, но интеграция в статусе ERROR — реальная ошибка.
        showError(`Ошибка: ${result?.errorMessage || extractErrorMessage(result) || 'Неизвестная ошибка'}`);
      } else if (isFailureEnvelope(result)) {
        showError(`Ошибка: ${extractErrorMessage(result) || 'Неизвестная ошибка'}`);
      } else if (result?.errorMessage && !/^connected successfully$/i.test(result.errorMessage)) {
        // Поле errorMessage при успехе содержит служебное сообщение бэкенда
        // ("Connected successfully") — игнорируем его, оно не является ошибкой.
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

  const handleDisconnect = async (provider: string) => {
    setLoading(true);
    try {
      const result = await api.post<any>(`/admin/integrations/${provider}/disconnect`);
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

  const handleSyncPrices = async (provider: string) => {
    setSyncing(true);
    try {
      const result = await api.post<any>(`/admin/integrations/${provider}/sync/prices`);
      if (isFailureEnvelope(result)) {
        showError(extractErrorMessage(result));
        setSyncing(false);
        return;
      }
      // Fix-15: бэкенд отвечает 202 Accepted + { logId } — синк идёт в фоне.
      // Запоминаем запуск и поллим журнал (эффект ниже), пока он не финиширует;
      // итоговый тост — с реальными счётчиками и честным статусом. Раньше запись
      // перечитывалась один раз и оставалась RUNNING до ручного F5
      // (боль: «она статичная и не меняется, пока не обновишь страницу»).
      showSuccess(
        `Синхронизация цен запущена${result?.logId != null ? ` (задача #${result.logId})` : ''}`
      );
      await loadSyncLogs();
      // Важно: watch ставим ПОСЛЕ перечитывания журнала — иначе эффект
      // завершения увидит устаревший список без нового запуска и сбросит слежение.
      if (result?.logId != null) setWatchedLogId(result.logId);
      await loadIntegrations();
    } catch (error: any) {
      console.error('Failed to sync prices:', error);
      handleApiError(error, 'Не удалось обновить цены');
      setSyncing(false);
    }
  };

  /** Выбор файла: сразу валидируем пустой/слишком большой, чтобы не гонять запрос. */
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
      setFileError(`Файл ${formatSize(file.size)} — больше лимита ${formatSize(MAX_UPLOAD_BYTES)}`);
      return;
    }
    setSelectedFile(file);
  };

  /**
   * Ручная загрузка выгрузки ЕМИСС (POST /admin/integrations/ROSSTAT/upload).
   * Подключение провайдера не требуется: портал не задействован вовсе.
   * Ответ — 202 { logId }; дальше следим за запуском как за обычным синком.
   */
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
  // (фоновая часть синка обновляет их в БД; UI должен оживать без F5).
  useEffect(() => {
    if (watchedLogId == null && !syncLogs.some(l => l.status === 'RUNNING')) return;
    const t = setInterval(() => {
      loadSyncLogs();
      loadIntegrations();
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncLogs, watchedLogId]);

  // Fix-15: наблюдаемый запуск достиг терминального статуса — честный итог:
  // SUCCESS (зелёный) / PARTIAL / FAILED (красные), со счётчиками.
  useEffect(() => {
    if (watchedLogId == null) return;
    const log = syncLogs.find(l => l.id === watchedLogId);
    if (!log) {
      // запуск не найден в журнале и RUNNING нет — считаем завершённым (страховка)
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return <CheckCircle size={20} style={{ color: 'var(--ok)' }} />;
      case 'ERROR':
        return <XCircle size={20} style={{ color: 'var(--fire)' }} />;
      default:
        return <WifiOff size={20} style={{ color: 'var(--muted)' }} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return 'Подключено';
      case 'ERROR':
        return 'Ошибка';
      default:
        return 'Отключено';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Интеграции</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Локальная копия ЕМИСС Росстата — источник плановых цен
        </p>
      </div>

      {/* Росстат (ЕМИСС) Card — Fix-13 */}
      <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, var(--w1), var(--w2))' }}>
              <Wifi size={24} style={{ color: 'var(--on-fire)' }} />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Росстат (ЕМИСС)</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Официальные средние потребительские цены Росстата (ЕМИСС, fedstat.ru) —
                «средняя цена по больнице» в рублях, ежемесячно, без ключей и лимитов.
                Синхронизация складывает выгрузку в локальную копию (справочник позиций
                и цены за последние два года), а цены продуктов берутся уже из неё:
                портал для расчёта меню не нужен. Привязка продукта к позиции ЕМИСС
                настраивается в редакторе продукта («Продукты» → «Источник цены»).
              </p>
              <p className="text-sm mt-2" style={{ color: 'var(--amber-300, var(--text))' }}>
                Синхронизация перезаписывает цены всех привязанных продуктов, включая
                введённые вручную: у привязанного продукта цена всегда из ЕМИСС.
              </p>
              <div className="flex items-center gap-2 mt-2">
                {rosstatIntegration && getStatusIcon(rosstatIntegration.status)}
                <span className="text-sm" style={{ color: 'var(--text)' }}>
                  {rosstatIntegration ? getStatusText(rosstatIntegration.status) : 'Не подключено'}
                </span>
              </div>
              {rosstatIntegration?.lastConnectedAt && (
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  Последнее подключение: {new Date(rosstatIntegration.lastConnectedAt).toLocaleString('ru-RU')}
                </p>
              )}
              {rosstatIntegration?.lastSyncAt && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Последняя синхронизация: {new Date(rosstatIntegration.lastSyncAt).toLocaleString('ru-RU')}
                </p>
              )}
              {/* FIX (баг «Ошибка: Connected successfully»): бэкенд сохранял в
                  error_message служебное сообщение успеха ("Connected successfully"),
                  и карточка показывала его как ошибку при статусе CONNECTED.
                  Теперь бэкенд чистит поле при успехе; на всякий случай красным
                  выводим ошибку только для статуса ERROR, а устаревшее текстовое
                  поле при CONNECTED не показываем вовсе. */}
              {rosstatIntegration?.status === 'ERROR' && rosstatIntegration.errorMessage && (
                <p className="text-xs mt-1" style={{ color: 'var(--fire)' }}>
                  Ошибка: {rosstatIntegration.errorMessage}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          {!rosstatIntegration || rosstatIntegration.status !== 'CONNECTED' ? (
            <Button variant="primary" size="sm" onClick={() => handleConnect('ROSSTAT')} disabled={loading} aria-label="Подключить интеграцию">
              <Link size={16} />
              Подключить
            </Button>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={() => handleSyncPrices('ROSSTAT')} disabled={syncing || hasRunningSync} aria-label="Синхронизировать цены">
                <RefreshCw size={16} className={syncing || hasRunningSync ? 'animate-spin' : ''} />
                {syncing || hasRunningSync ? 'Синхронизация...' : 'Обновить цены'}
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDisconnect('ROSSTAT')} disabled={loading} aria-label="Отключить интеграцию">
                <Unlink size={16} />
                Отключить
              </Button>
            </>
          )}
        </div>

        {/* Ручная загрузка выгрузки: портал ЕМИСС закрывается анти-ботом и отдаёт 302/503,
            поэтому файл, скачанный владельцем вручную, — полноценный способ наполнить
            локальную копию. Блок виден всегда: подключение провайдера для него не нужно. */}
        <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
          <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>
            Загрузить выгрузку ЕМИСС вручную
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Файл SDMX-выгрузки (XML) с портала ЕМИСС — тот же набор данных, что берёт
            синхронизация. Выберите файл и нажмите «Прогрузить»: позиции справочника и
            цены попадут в локальную копию, цены привязанных продуктов пересчитаются.
          </p>

          <div className="flex gap-2 items-center mt-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Файл выгрузки ЕМИСС"
              data-testid="emis-file-input"
            />
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Выбрать файл выгрузки">
              <Upload size={16} />
              Выбрать файл
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleUpload}
              disabled={uploading || !selectedFile || syncing || hasRunningSync}
              aria-label="Прогрузить выгрузку ЕМИСС"
            >
              <RefreshCw size={16} className={uploading ? 'animate-spin' : ''} />
              {uploading ? 'Загрузка…' : 'Прогрузить'}
            </Button>

            {selectedFile && (
              <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <span className="chip-delta">{selectedFile.name} · {formatSize(selectedFile.size)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  aria-label="Убрать выбранный файл"
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--muted)' }}
                >
                  <X size={14} />
                </button>
              </span>
            )}
          </div>

          {fileError && (
            <p className="text-xs mt-2" style={{ color: 'var(--fire)' }}>{fileError}</p>
          )}
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            Ограничение размера — {formatSize(MAX_UPLOAD_BYTES)} (EMIS_UPLOAD_MAX_FILE_SIZE).
          </p>
        </div>
      </div>

      <IntegrationSyncLogs logs={syncLogs} />
    </div>
  );
}
