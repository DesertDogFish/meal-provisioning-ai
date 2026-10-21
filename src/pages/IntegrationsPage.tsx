import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { Wifi, WifiOff, RefreshCw, Search, Link, Unlink, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '../components/ToastProvider';

interface Integration {
  id: number;
  provider: string;
  status: string;
  baseUrl: string;
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
}

interface SyncLog {
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

interface ExternalProduct {
  code: string;
  name: string;
  brand: string | null;
  packAmount: number | null;
  packUnit: string | null;
  imageUrl: string | null;
}

export default function IntegrationsPage() {
  const { state } = useApp();
  const { showError, showSuccess } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExternalProduct[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Получаем токен из контекста
  const getAuthHeaders = () => {
    const token = state.isAuthenticated ? 'mock-token' : null; // В реальном приложении токен хранится в state
    return {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json'
    };
  };

  useEffect(() => {
    loadIntegrations();
    loadSyncLogs();
  }, []);

  const loadIntegrations = async () => {
    try {
      const response = await fetch('/api/v1/admin/integrations', {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setIntegrations(data);
      } else {
        const error = await response.json().catch(() => ({ detail: 'Failed to load integrations' }));
        showError(error.detail || 'Failed to load integrations');
      }
    } catch (error) {
      console.error('Failed to load integrations:', error);
      showError('Network error while loading integrations');
    }
  };

  const loadSyncLogs = async () => {
    try {
      const response = await fetch('/api/v1/admin/integrations/sync-logs', {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setSyncLogs(data);
      }
    } catch (error) {
      console.error('Failed to load sync logs:', error);
    }
  };

  const handleConnect = async (provider: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/integrations/${provider}/connect`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        await loadIntegrations();
        showSuccess(`Successfully connected to ${provider}`);
      } else {
        const error = await response.json().catch(() => ({ detail: 'Failed to connect' }));
        showError(error.detail || 'Failed to connect');
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      showError('Network error while connecting');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (provider: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/integrations/${provider}/disconnect`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        await loadIntegrations();
        showSuccess(`Successfully disconnected from ${provider}`);
      } else {
        const error = await response.json().catch(() => ({ detail: 'Failed to disconnect' }));
        showError(error.detail || 'Failed to disconnect');
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
      showError('Network error while disconnecting');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPrices = async (provider: string) => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/v1/admin/integrations/${provider}/sync/prices`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const log = await response.json();
        await loadIntegrations();
        await loadSyncLogs();
        showSuccess(`Sync completed: ${log.createdCount} created, ${log.updatedCount} updated, ${log.errorCount} errors`);
      } else {
        const error = await response.json().catch(() => ({ detail: 'Failed to sync prices' }));
        showError(error.detail || 'Failed to sync prices');
      }
    } catch (error) {
      console.error('Failed to sync prices:', error);
      showError('Network error while syncing prices');
    } finally {
      setSyncing(false);
    }
  };

  const handleSearchProducts = async () => {
    if (!searchQuery.trim() || !selectedIngredient) return;
    
    try {
      const response = await fetch(
        `/api/v1/admin/integrations/OFF/products/search?query=${encodeURIComponent(searchQuery)}&limit=20`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
        if (data.length === 0) {
          showError('No products found');
        }
      } else {
        const error = await response.json().catch(() => ({ detail: 'Failed to search products' }));
        showError(error.detail || 'Failed to search products');
      }
    } catch (error) {
      console.error('Failed to search products:', error);
      showError('Network error while searching products');
    }
  };

  const handleCreateMapping = async (product: ExternalProduct) => {
    if (!selectedIngredient) return;
    
    try {
      const response = await fetch(`/api/v1/admin/integrations/ingredients/${selectedIngredient}/mapping`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          provider: 'OFF',
          externalCode: product.code,
          packAmount: product.packAmount,
          packUnit: product.packUnit
        })
      });
      
      if (response.ok) {
        setSearchResults([]);
        setSearchQuery('');
        setSelectedIngredient(null);
        showSuccess('Product mapping created successfully');
      } else {
        const error = await response.json().catch(() => ({ detail: 'Failed to create mapping' }));
        showError(error.detail || 'Failed to create mapping');
      }
    } catch (error) {
      console.error('Failed to create mapping:', error);
      showError('Network error while creating mapping');
    }
  };

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

  const offIntegration = integrations.find(i => i.provider === 'OFF');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Интеграции</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Подключение к внешним сервисам для получения актуальных цен
        </p>
      </div>

      {/* Open Food Facts Card */}
      <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" 
                 style={{ background: 'linear-gradient(135deg, var(--w1), var(--w2))' }}>
              <Wifi size={24} style={{ color: '#04121A' }} />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Open Food Facts</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Краудсорсинговая база данных продуктов питания с реальными ценами
              </p>
              <div className="flex items-center gap-2 mt-2">
                {offIntegration && getStatusIcon(offIntegration.status)}
                <span className="text-sm" style={{ color: 'var(--text)' }}>
                  {offIntegration ? getStatusText(offIntegration.status) : 'Не подключено'}
                </span>
              </div>
              {offIntegration?.lastConnectedAt && (
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  Последнее подключение: {new Date(offIntegration.lastConnectedAt).toLocaleString('ru-RU')}
                </p>
              )}
              {offIntegration?.lastSyncAt && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Последняя синхронизация: {new Date(offIntegration.lastSyncAt).toLocaleString('ru-RU')}
                </p>
              )}
              {offIntegration?.errorMessage && (
                <p className="text-xs mt-1" style={{ color: 'var(--fire)' }}>
                  Ошибка: {offIntegration.errorMessage}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          {!offIntegration || offIntegration.status !== 'CONNECTED' ? (
            <button
              onClick={() => handleConnect('OFF')}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all"
              style={{ 
                background: 'linear-gradient(90deg, var(--w1), var(--w2))', 
                color: '#04121A',
                opacity: loading ? 0.5 : 1
              }}
            >
              <Link size={16} />
              Подключить
            </button>
          ) : (
            <>
              <button
                onClick={() => handleSyncPrices('OFF')}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all"
                style={{ 
                  background: 'linear-gradient(90deg, var(--w1), var(--w2))', 
                  color: '#04121A',
                  opacity: syncing ? 0.5 : 1
                }}
              >
                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Синхронизация...' : 'Обновить цены'}
              </button>
              <button
                onClick={() => handleDisconnect('OFF')}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                style={{ 
                  border: '1px solid var(--border)', 
                  color: 'var(--text)',
                  opacity: loading ? 0.5 : 1
                }}
              >
                <Unlink size={16} />
                Отключить
              </button>
            </>
          )}
        </div>
      </div>

      {/* Product Mapping */}
      {offIntegration?.status === 'CONNECTED' && (
        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
            Привязка товаров
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>
                Выберите ингредиент
              </label>
              <select
                value={selectedIngredient || ''}
                onChange={e => setSelectedIngredient(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <option value="">Выберите ингредиент...</option>
                {state.ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>{ing.name}</option>
                ))}
              </select>
            </div>

            {selectedIngredient && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>
                  Поиск товара в Open Food Facts
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && handleSearchProducts()}
                      placeholder="Введите название продукта..."
                      className="w-full pl-10 pr-4 py-2 rounded-lg outline-none"
                      style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                  <button
                    onClick={handleSearchProducts}
                    className="px-4 py-2 rounded-full text-sm font-bold"
                    style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}
                  >
                    Найти
                  </button>
                </div>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
                  Найдено товаров: {searchResults.length}
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {searchResults.map(product => (
                    <div
                      key={product.code}
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
                    >
                      {product.imageUrl && (
                        <img 
                          src={product.imageUrl} 
                          alt={product.name}
                          className="w-12 h-12 rounded object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: 'var(--text)' }}>{product.name}</p>
                        {product.brand && (
                          <p className="text-xs" style={{ color: 'var(--muted)' }}>{product.brand}</p>
                        )}
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          Код: {product.code}
                          {product.packAmount && product.packUnit && (
                            <> • {product.packAmount} {product.packUnit}</>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCreateMapping(product)}
                        className="px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}
                      >
                        Привязать
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sync Logs */}
      {syncLogs.length > 0 && (
        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
            Журнал синхронизаций
          </h3>
          <div className="space-y-2">
            {syncLogs.slice(0, 10).map(log => (
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
      )}
    </div>
  );
}
