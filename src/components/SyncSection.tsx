import { useEffect, useState } from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

import { useOffline } from '../hooks/useOffline';
import { syncManager, type SyncState } from '../sync/SyncManager';
import { getSyncSettings, setSyncSettings, subscribeSyncSettings, SYNC_INTERVALS_MIN, type SyncSettings } from '../sync/syncSettings';
import { useToast } from './ToastProvider';
import { Button } from './Button';

/**
 * Блок синхронизации в боковом меню (владелец 07.11.2026, п.14):
 *  - статус сети (онлайн/офлайн) и размер локальной очереди;
 *  - кнопка «Синхронизировать» — принудительный запуск очереди;
 *  - настройка автосинка: выкл / каждые 1–30 минут (по умолчанию 5).
 *
 * Сам автосинк запускается не здесь, а на старте приложения (App.tsx), иначе
 * он жил бы только пока открыто меню. Здесь только управление и статус.
 */
export interface SyncSectionProps {
  /** закрыть drawer после действия (на телефоне меню полноэкранное) */
  onAfterAction?: () => void;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function SyncSection({ onAfterAction }: SyncSectionProps) {
  const { online } = useOffline();
  const { showSuccess, showError } = useToast();
  const [state, setState] = useState<SyncState>(() => syncManager.getState());
  const [settings, setSettingsState] = useState<SyncSettings>(() => getSyncSettings());

  useEffect(() => {
    const un1 = syncManager.subscribe(setState);
    const un2 = subscribeSyncSettings(setSettingsState);
    void syncManager.refreshPending();
    return () => { un1(); un2(); };
  }, []);

  const runNow = async () => {
    if (!online) {
      showError('Нет сети — синхронизация невозможна');
      return;
    }
    const result = await syncManager.forceSync();
    if (result.skipped) {
      showError('Синхронизация уже идёт');
      return;
    }
    if (result.failed > 0) {
      showError(`Отправлено ${result.sent}, осталось в очереди ${result.failed}`);
    } else if (result.sent > 0) {
      showSuccess(`Синхронизировано: ${result.sent} ${result.sent === 1 ? 'изменение' : 'изменений'}`);
    } else {
      showSuccess('Синхронизировано: всё уже на сервере');
    }
    onAfterAction?.();
  };

  const onIntervalChange = (value: string) => {
    const minutes = Number(value);
    setSyncSettings({ enabled: minutes > 0, intervalMin: minutes });
  };

  const intervalValue = settings.enabled ? String(settings.intervalMin) : '0';

  return (
    <div className="px-4 py-3 space-y-2" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs" style={{ color: online ? 'var(--success)' : 'var(--muted)' }} data-testid="sync-status">
          {online ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />}
          {online ? 'Онлайн' : 'Офлайн'}
        </span>
        <span className="text-xs keep-num" style={{ color: 'var(--text-3)' }} data-testid="sync-pending">
          {state.pending > 0 ? `в очереди ${state.pending}` : 'очередь пуста'}
        </span>
      </div>

      <Button
        variant="soft"
        className="w-full"
        onClick={() => void runNow()}
        disabled={state.syncing}
        data-testid="sync-now"
        icon={<RefreshCw size={16} className={state.syncing ? 'animate-spin' : undefined} aria-hidden />}
      >
        {state.syncing ? 'Синхронизируем…' : 'Синхронизировать'}
      </Button>

      <label className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
        <span>Автосинк</span>
        <select
          value={intervalValue}
          onChange={(e) => onIntervalChange(e.target.value)}
          aria-label="Интервал автосинхронизации"
          data-testid="sync-interval"
          className="rounded-lg px-2 py-1"
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--text-1)' }}
        >
          {SYNC_INTERVALS_MIN.map((m) => (
            <option key={m} value={String(m)}>
              {m === 0 ? 'выключен' : m === 1 ? 'каждую минуту' : `каждые ${m} мин`}
            </option>
          ))}
        </select>
      </label>

      {state.lastRunAt != null && (
        <p className="text-xs" style={{ color: 'var(--text-3)' }} data-testid="sync-last">
          Последняя: {formatTime(state.lastRunAt)}
          {state.lastSent > 0 ? ` · отправлено ${state.lastSent}` : ''}
          {state.lastFailed > 0 ? ` · в очереди ${state.lastFailed}` : ''}
        </p>
      )}
    </div>
  );
}

export default SyncSection;
