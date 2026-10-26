import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { startWatchdog, stopWatchdog, onWatchdogChange } from '../api/watchdog';
import { X, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { Button } from './Button';
import Modal from './Modal';
import { useToast } from './ToastProvider';

export default function ApiModeBadge() {
  const { showSuccess, showError } = useToast();
  const [mode, setMode] = useState<'real' | 'mock'>(api.getMode());
  const [showModal, setShowModal] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Запуск watchdog
    startWatchdog();
    
    // Подписка на изменения
    const unsubscribe = onWatchdogChange((available, latency, error) => {
      setApiAvailable(available);
      setLastLatency(latency);
      setLastError(error);
      
      // Если API стал недоступен в режиме real - показываем предупреждение
      if (!available && mode === 'real') {
        showError('API недоступен, переключение на демо-данные');
      }
    });
    
    return () => {
      stopWatchdog();
      unsubscribe();
    };
  }, [mode, showError]);

  const handleModeChange = (newMode: 'real' | 'mock') => {
    api.setMode(newMode);
    setMode(newMode);
    showSuccess(`Режим переключён на: ${newMode === 'real' ? 'Бэкенд' : 'Демо-данные'}`);
  };

  const handleCheckConnection = async () => {
    setChecking(true);
    try {
      const startTime = Date.now();
      await api.get('/meta');
      const latency = Date.now() - startTime;
      setApiAvailable(true);
      setLastLatency(latency);
      setLastError(null);
      showSuccess(`API доступен (${latency}ms)`);
    } catch (error) {
      setApiAvailable(false);
      setLastError(error instanceof Error ? error.message : 'Unknown error');
      showError('API недоступен');
    } finally {
      setChecking(false);
    }
  };

  const handleResetData = () => {
    if (confirm('Сбросить все демо-данные?')) {
      api.resetSeedData();
      showSuccess('Демо-данные сброшены');
      window.location.reload();
    }
  };

  const getBadgeColor = () => {
    if (mode === 'real' && apiAvailable) return 'var(--wave-400)'; // зелёный
    if (mode === 'real' && !apiAvailable) return 'var(--flame-600)'; // красный
    return 'var(--amber-500)'; // янтарный для mock
  };

  const getBadgeText = () => {
    if (mode === 'real' && apiAvailable) return 'бэкенд: подключён';
    if (mode === 'real' && !apiAvailable) return 'бэкенд: ошибка';
    return 'демо-режим';
  };

  return (
    <>
      {/* Бейдж */}
      <div
        className="fixed top-20 lg:top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-[var(--r-pill)] cursor-pointer transition-colors"
        style={{
          zIndex: 'var(--z-nav)',
          background: 'var(--surface)',
          border: `2px solid ${getBadgeColor()}`,
          fontSize: '11px',
          fontWeight: 600,
          boxShadow: 'var(--shadow-1)'
        }}
        onClick={() => setShowModal(true)}
        title="Клик для настройки режима"
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: getBadgeColor(),
            boxShadow: `0 0 8px ${getBadgeColor()}`
          }}
        />
        <span style={{ color: 'var(--muted)' }}>
          {getBadgeText()}
        </span>
      </div>

      {/* Модалка. Список багов 25.10 (U3/U14): единый оверлей приложения —
          общий <Modal> (портал в body, .modal-overlay), а не собственный fixed-div. */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div
            className="rounded-2xl shadow-2xl w-full max-w-md p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            role="dialog" aria-modal="true" aria-label="Режим API"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Режим данных</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Текущий статус */}
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--elev)' }}>
              <div className="flex items-center gap-2 mb-2">
                {apiAvailable ? (
                  <Wifi size={16} style={{ color: 'var(--wave-400)' }} />
                ) : (
                  <WifiOff size={16} style={{ color: 'var(--flame-600)' }} />
                )}
                <span style={{ color: 'var(--text)', fontSize: '13px' }}>
                  API: {apiAvailable ? 'доступен' : 'недоступен'}
                </span>
                {lastLatency && (
                  <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    ({lastLatency}ms)
                  </span>
                )}
              </div>
              {lastError && (
                <p style={{ color: 'var(--danger)', fontSize: '12px' }}>
                  Ошибка: {lastError}
                </p>
              )}
            </div>

            {/* Переключатель режимов */}
            <div className="space-y-3 mb-6">
              <div
                className="rounded-xl p-4 cursor-pointer transition-all"
                style={{
                  background: mode === 'real' ? 'color-mix(in srgb, var(--wave-400) 10%, transparent)' : 'var(--elev)',
                  border: mode === 'real' ? '2px solid var(--ok)' : '1px solid var(--border)'
                }}
                onClick={() => handleModeChange('real')}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: 'var(--wave-400)', boxShadow: '0 0 8px var(--success)' }}
                  />
                  <div className="flex-1">
                    <p className="font-bold" style={{ color: 'var(--text)' }}>Бэкенд</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      HTTP запросы к Spring Boot API
                    </p>
                  </div>
                  {mode === 'real' && (
                    <span className="text-xs font-bold" style={{ color: 'var(--ok)' }}>АКТИВЕН</span>
                  )}
                </div>
              </div>

              <div
                className="rounded-xl p-4 cursor-pointer transition-all"
                style={{
                  background: mode === 'mock' ? 'color-mix(in srgb, var(--amber-500) 10%, transparent)' : 'var(--elev)',
                  border: mode === 'mock' ? '2px solid var(--fire)' : '1px solid var(--border)'
                }}
                onClick={() => handleModeChange('mock')}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: 'var(--fire)', boxShadow: '0 0 8px var(--fire)' }}
                  />
                  <div className="flex-1">
                    <p className="font-bold" style={{ color: 'var(--text)' }}>Демо-данные</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Локальные данные в localStorage
                    </p>
                  </div>
                  {mode === 'mock' && (
                    <span className="text-xs font-bold" style={{ color: 'var(--fire)' }}>АКТИВЕН</span>
                  )}
                </div>
              </div>
            </div>

            {/* Кнопки действий */}
            <div className="space-y-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleCheckConnection}
                loading={checking}
              >
                {checking ? 'Проверка...' : 'Проверить соединение'}
              </Button>

              {mode === 'mock' && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleResetData}
                >
                  <AlertCircle size={16} />
                  Сбросить демо-данные
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
