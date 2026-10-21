import { useState, useEffect } from 'react';
import { api, type ApiMode } from '../api/client';
import { X, RefreshCw, AlertCircle } from 'lucide-react';
import { useToast } from './ToastProvider';

export function ApiModeModal({ onClose }: { onClose: () => void }) {
  const { showSuccess } = useToast();
  const [currentMode, setCurrentMode] = useState<ApiMode>(api.getMode());
  const [resolving, setResolving] = useState(false);

  const handleModeChange = (mode: ApiMode) => {
    api.setMode(mode);
    setCurrentMode(mode);
    showSuccess(`Режим переключён на: ${mode === 'mock' ? 'демо-данные' : 'бэкенд'}`);
  };

  const handleAutoDetect = async () => {
    setResolving(true);
    const detected = await api.resolveMode();
    setCurrentMode(detected);
    setResolving(false);
    showSuccess(`Авто-детект: ${detected === 'mock' ? 'демо-режим' : 'бэкенд подключён'}`);
  };

  const handleResetSeed = () => {
    if (confirm('Сбросить все демо-данные до начального состояния?')) {
      api.resetSeedData();
      showSuccess('Демо-данные сброшены');
      window.location.reload();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div 
        className="rounded-2xl shadow-2xl w-full max-w-md p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Режим данных</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <div 
            className="rounded-xl p-4 cursor-pointer transition-all"
            style={{ 
              background: currentMode === 'mock' ? 'rgba(245, 158, 11, 0.1)' : 'var(--elev)',
              border: currentMode === 'mock' ? '2px solid var(--fire)' : '1px solid var(--border)'
            }}
            onClick={() => handleModeChange('mock')}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ background: 'var(--fire)', boxShadow: '0 0 8px var(--fire)' }}
              />
              <div className="flex-1">
                <p className="font-bold" style={{ color: 'var(--text)' }}>Демо-режим</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Локальные данные в localStorage. Работает без бэкенда.
                </p>
              </div>
              {currentMode === 'mock' && (
                <span className="text-xs font-bold" style={{ color: 'var(--fire)' }}>АКТИВЕН</span>
              )}
            </div>
          </div>

          <div 
            className="rounded-xl p-4 cursor-pointer transition-all"
            style={{ 
              background: currentMode === 'real' ? 'rgba(52, 211, 153, 0.1)' : 'var(--elev)',
              border: currentMode === 'real' ? '2px solid var(--ok)' : '1px solid var(--border)'
            }}
            onClick={() => handleModeChange('real')}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)' }}
              />
              <div className="flex-1">
                <p className="font-bold" style={{ color: 'var(--text)' }}>Бэкенд</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  HTTP запросы к Spring Boot API. Требуется запущенный бэкенд.
                </p>
              </div>
              {currentMode === 'real' && (
                <span className="text-xs font-bold" style={{ color: 'var(--ok)' }}>АКТИВЕН</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleAutoDetect}
            disabled={resolving}
            className="w-full px-4 py-2.5 rounded-full font-semibold transition-all flex items-center justify-center gap-2"
            style={{ 
              background: 'linear-gradient(90deg, var(--w1), var(--w2))', 
              color: '#04121A',
              opacity: resolving ? 0.6 : 1
            }}
          >
            {resolving ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Проверка бэкенда...
              </>
            ) : (
              'Авто-детект режима'
            )}
          </button>

          {currentMode === 'mock' && (
            <button
              onClick={handleResetSeed}
              className="w-full px-4 py-2.5 rounded-full font-semibold transition-all flex items-center justify-center gap-2"
              style={{ 
                border: '1px solid var(--fire)',
                color: 'var(--fire)'
              }}
            >
              <AlertCircle size={16} />
              Сбросить демо-данные
            </button>
          )}
        </div>

        <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--elev)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            <b>Текущий режим:</b> {currentMode === 'mock' ? 'Демо-данные (localStorage)' : 'Бэкенд (HTTP)'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            <b>Seed version:</b> {localStorage.getItem('seedVersion') || 'не установлен'}
          </p>
        </div>
      </div>
    </div>
  );
}
