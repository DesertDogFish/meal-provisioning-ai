/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.3): вкладка «Настройка»
 * раздела «Интеграции» — презентация карточки Росстат (ЕМИСС): статус провайдера
 * (единственная витрина статуса), подключение/отключение, ЕДИНСТВЕННАЯ кнопка
 * запуска синка и ручная загрузка SDMX-выгрузки. Логика (запросы, поллинг) —
 * в странице `IntegrationsPage`; компонент презентационный (props-driven).
 *
 * navigation-п.7: упоминание редактора продукта — ссылка на «Продукты»
 * (текст-инструкция → ссылка, клик без потери контекста).
 */
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { Wifi, WifiOff, RefreshCw, Upload, X, CheckCircle, XCircle, Link as LinkIcon, Unlink, History } from 'lucide-react';
import { Button } from './Button';

export interface IntegrationInfo {
  id: number;
  provider: string;
  status: string;
  baseUrl: string;
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
}

export interface EmisSettingsTabProps {
  rosstatIntegration: IntegrationInfo | undefined;
  loading: boolean;
  syncing: boolean;
  uploading: boolean;
  hasRunningSync: boolean;
  selectedFile: File | null;
  fileError: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  maxUploadLabel: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncPrices: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  onClearFile: () => void;
  /** перейти на таб «Журнал синков» (footer-ссылка, navigation-п.7) */
  onOpenLogs: () => void;
}

export function EmisSettingsTab(props: EmisSettingsTabProps) {
  const {
    rosstatIntegration, loading, syncing, uploading, hasRunningSync,
    selectedFile, fileError, fileInputRef, maxUploadLabel,
    onConnect, onDisconnect, onSyncPrices, onFileChange, onUpload, onClearFile, onOpenLogs,
  } = props;

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
      case 'CONNECTED': return 'Подключено';
      case 'ERROR': return 'Ошибка';
      default: return 'Отключено';
    }
  };

  return (
    <div className="space-y-6" data-testid="emis-settings-tab">
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
                настраивается в редакторе продукта ({' '}
                {/* navigation-п.7: текст-инструкция → ссылка */}
                <Link to="/products" style={{ color: 'var(--w1)' }} data-testid="link-products">«Продукты»</Link>
                {' '}→ «Источник цены»).
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
              {/* Красным — только реальная ошибка (статус ERROR) */}
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
            <Button variant="primary" size="sm" onClick={onConnect} disabled={loading} aria-label="Подключить интеграцию">
              <LinkIcon size={16} />
              Подключить
            </Button>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={onSyncPrices} disabled={syncing || hasRunningSync} aria-label="Синхронизировать цены">
                <RefreshCw size={16} className={syncing || hasRunningSync ? 'animate-spin' : ''} />
                {syncing || hasRunningSync ? 'Синхронизация...' : 'Обновить цены'}
              </Button>
              <Button variant="danger" size="sm" onClick={onDisconnect} disabled={loading} aria-label="Отключить интеграцию">
                <Unlink size={16} />
                Отключить
              </Button>
            </>
          )}
          {/* navigation-п.7: короткий журнал убран (дубль) — ссылка на полный журнал */}
          <Button variant="ghost" size="sm" onClick={onOpenLogs} data-testid="goto-logs">
            <History size={16} />
            Журнал синков →
          </Button>
        </div>

        {/* Ручная загрузка выгрузки: портал ЕМИСС закрывается анти-ботом, файл —
            полноценный способ наполнить локальную копию. */}
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
              onChange={onFileChange}
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
              onClick={onUpload}
              disabled={uploading || !selectedFile || syncing || hasRunningSync}
              aria-label="Прогрузить выгрузку ЕМИСС"
            >
              <RefreshCw size={16} className={uploading ? 'animate-spin' : ''} />
              {uploading ? 'Загрузка…' : 'Прогрузить'}
            </Button>

            {selectedFile && (
              <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <span className="chip-delta">{selectedFile.name} · {formatFileSize(selectedFile.size)}</span>
                <button
                  type="button"
                  onClick={onClearFile}
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
            Ограничение размера — {maxUploadLabel} (EMIS_UPLOAD_MAX_FILE_SIZE).
          </p>
        </div>
      </div>
    </div>
  );
}

/** Человекочитаемый размер файла (КБ/МБ) — для чипа выбранного файла. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

export default EmisSettingsTab;
