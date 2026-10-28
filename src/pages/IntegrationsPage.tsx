import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Search, Link, Unlink, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { api } from '../api/client';
import { Button } from '../components/Button';
import CustomSelect from '../components/CustomSelect'; // Fix-6 (п.1)

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
  // Fix-14: свежая цена категории и её период (месяц) — приходят из поиска,
  // чтобы админ видел реальную цифру до привязки. null, если выгрузка цен
  // ещё не выполнена/недоступна (поиск при этом работает).
  price: number | null;
  priceDate: string | null;
}

// Fix-14: текущая привязка ингредиента к внешнему товару (GET /mappings)
interface Binding {
  mappingId: number;
  ingredientId: number;
  ingredientName: string;
  externalCode: string;
  externalName: string | null;
  packAmount: number | null;
  packUnit: string | null;
  createdAt: string | null;
}

interface Ingredient {
  id: string;
  name: string;
}

// Fix-14: хелперы отображения цены/периода в результатах поиска
function formatPrice(v: number): string {
  return v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function unitLabel(packUnit: string | null): string {
  switch ((packUnit || '').toUpperCase()) {
    case 'KG': return 'кг';
    case 'L': return 'л';
    case 'PCS': return 'шт';
    default: return packUnit || 'ед.';
  }
}
function formatPeriod(iso: string): string {
  // priceDate приходит как ISO LocalDate (yyyy-MM-dd) — показываем месяц и год
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

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
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExternalProduct[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Fix-14: текущие привязки (что уже связано) — снимают неопределённость
  // «якобы маппинг уже есть, хотя хрен знает что там есть».
  const [bindings, setBindings] = useState<Binding[]>([]);

  useEffect(() => {
    loadIntegrations();
    loadSyncLogs();
    loadIngredients();
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
      const data = await api.get<SyncLog[]>('/admin/integrations/sync-logs');
      setSyncLogs(data);
    } catch (error) {
      console.error('Failed to load sync logs:', error);
      // ЗАДАЧА 3: пользователь должен видеть сбой загрузки, а UI не должен
      // показывать устаревший список.
      setSyncLogs([]);
      showError('Не удалось загрузить журнал синков');
    }
  };

  const loadIngredients = async () => {
    try {
      const data = await api.get<any>('/admin/products');
      setIngredients(data.content || data);
    } catch (error) {
      console.error('Failed to load ingredients:', error);
      setIngredients([]);
      showError('Не удалось загрузить список ингредиентов');
    }
  };

  // Fix-14: загрузка текущих привязок Росстата. Молча глотает «не подключено» —
  // блок привязок рендерится только при CONNECTED, так что это страховка от гонки.
  const loadBindings = async () => {
    try {
      const data = await api.get<Binding[]>('/admin/integrations/ROSSTAT/mappings');
      setBindings(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load bindings:', error);
      setBindings([]);
    }
  };

  // Fix-13: единственная интеграция — Росстат (ЕМИСС); OFF демонтирован
  const rosstatIntegration = integrations.find(i => i.provider === 'ROSSTAT');
  const rosstatConnected = rosstatIntegration?.status === 'CONNECTED';

  // Fix-14: как только интеграция подключена — показываем, что уже привязано.
  useEffect(() => {
    if (rosstatConnected) loadBindings();
    else setBindings([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosstatConnected]);

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
      } else {
        // Бэкенд отвечает 202 Accepted с телом { logId: N } — счётчики created/updated
        // лежат в sync-логе, поэтому перечитываем логи и показываем свежий результат.
        await loadSyncLogs();
        const latest = syncLogs.find(l => l.provider === provider); // до перезагрузки — предыдущий снимок
        await loadIntegrations();
        if (latest && latest.status === 'FAILED') {
          showError('Синхронизация завершилась с ошибкой, детали в журнале');
        } else {
          showSuccess(
            `Запрошена синхронизация цен${result?.logId != null ? ` (задача #${result.logId})` : ''}. ` +
            'Результат появится в журнале после завершения.'
          );
        }
      }
      await loadIntegrations();
      await loadSyncLogs();
    } catch (error: any) {
      console.error('Failed to sync prices:', error);
      handleApiError(error, 'Не удалось обновить цены');
    } finally {
      setSyncing(false);
    }
  };

  const handleSearchProducts = async () => {
    if (!searchQuery.trim() || !selectedIngredient) return;
    
    try {
      const data = await api.get<ExternalProduct[]>(
        `/admin/integrations/ROSSTAT/products/search?query=${encodeURIComponent(searchQuery)}&limit=20`
      );
      setSearchResults(data);
      if (data.length === 0) {
        showError('Ничего не найдено');
      }
    } catch (error: any) {
      console.error('Failed to search products:', error);
      // ЗАДАЧА 3: сброс результатов + русское сообщение
      setSearchResults([]);
      handleApiError(error, 'Не удалось выполнить поиск товаров');
    }
  };

  const handleCreateMapping = async (product: ExternalProduct) => {
    if (!selectedIngredient) return;
    
    try {
      await api.post(`/admin/integrations/ingredients/${selectedIngredient}/mapping`, {
        provider: 'ROSSTAT',
        externalCode: product.code,
        packAmount: product.packAmount,
        packUnit: product.packUnit
      });
      
      setSearchResults([]);
      setSearchQuery('');
      setSelectedIngredient(null);
      // Fix-14: бэкенд теперь делает upsert — повторная привязка того же
      // ингредиента не ошибка, а замена товара. Перечитываем список привязок.
      await loadBindings();
      showSuccess(`Привязано: ${product.name}`);
    } catch (error: any) {
      console.error('Failed to create mapping:', error);
      handleApiError(error, 'Не удалось создать связь с товаром');
    }
  };

  // Fix-14: отвязка ингредиента от внешнего товара (DELETE уже был на бэкенде,
  // но не использовался в UI — админ не мог убрать/заменить привязку).
  const handleDeleteMapping = async (binding: Binding) => {
    try {
      await api.del(`/admin/integrations/ingredients/${binding.ingredientId}/mapping/ROSSTAT`);
      setBindings(prev => prev.filter(b => b.mappingId !== binding.mappingId));
      showSuccess(`Привязка «${binding.ingredientName}» удалена`);
    } catch (error: any) {
      console.error('Failed to delete mapping:', error);
      handleApiError(error, 'Не удалось удалить привязку');
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Интеграции</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Подключение к внешним сервисам для получения актуальных цен
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
                Официальные средние потребительские цены Росстата (ЕМИСС, fedstat.ru)
                на базовые продукты питания — «средняя цена по больнице» в рублях,
                ежемесячно, без ключей и лимитов. Привяжите категории («Гречневая крупа»,
                «Молоко питьевое»…) к ингредиентам — синхронизация наполнит плановые цены.
                Введённые вручную цены не перезаписываются.
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

        <div className="flex gap-3">
          {!rosstatIntegration || rosstatIntegration.status !== 'CONNECTED' ? (
            <Button variant="primary" size="sm" onClick={() => handleConnect('ROSSTAT')} disabled={loading} aria-label="Подключить интеграцию">
                          <Link size={16} />
                          Подключить
                        </Button>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={() => handleSyncPrices('ROSSTAT')} disabled={syncing} aria-label="Синхронизировать цены">
                              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                              {syncing ? 'Синхронизация...' : 'Обновить цены'}
                            </Button>
              <Button variant="danger" size="sm" onClick={() => handleDisconnect('ROSSTAT')} disabled={loading} aria-label="Отключить интеграцию">
                              <Unlink size={16} />
                              Отключить
                            </Button>
            </>
          )}
        </div>
      </div>

      {/* Product Mapping */}
      {rosstatIntegration?.status === 'CONNECTED' && (
        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
            Привязка товаров
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>
                Выберите ингредиент
              </label>
              {/* Fix-6 (п.1): единый стиль выпадающих списков */}
              <CustomSelect
                value={String(selectedIngredient ?? '')}
                onChange={v => setSelectedIngredient(v || null)}
                options={[{ value: '', label: 'Выберите ингредиент…' }, ...ingredients.map(ing => ({ value: String(ing.id), label: ing.name }))]}
                ariaLabel="Ингредиент для привязки"
              />
            </div>

            {selectedIngredient && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>
                  Поиск категории в Росстате
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
                  <Button variant="primary" size="sm" onClick={handleSearchProducts} aria-label="Найти товар">
                                      Найти
                                    </Button>
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
                        {/* Fix-14: свежая цена категории из ЕМИСС (₽ за единицу фасовки).
                            Если выгрузка цен недоступна — подсказка, что цена придёт после синка. */}
                        {product.price != null ? (
                          <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ok)' }}>
                            {formatPrice(product.price)} ₽
                            <span className="font-normal" style={{ color: 'var(--muted)' }}>
                              {' '}/ {unitLabel(product.packUnit)}
                              {product.priceDate ? ` • ${formatPeriod(product.priceDate)}` : ''}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            Цена появится после синхронизации
                          </p>
                        )}
                      </div>
                      <Button variant="primary" size="sm" onClick={() => handleCreateMapping(product)} aria-label="Привязать товар">
                                              Привязать
                                            </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fix-14: Текущие привязки — видно, что уже связано; можно отвязать/заменить */}
      {rosstatConnected && (
        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Текущие привязки</h3>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>{bindings.length}</span>
          </div>
          {bindings.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Пока ничего не привязано — выберите ингредиент выше и найдите подходящую категорию Росстата.
            </p>
          ) : (
            <div className="space-y-2">
              {bindings.map(b => (
                <div
                  key={b.mappingId}
                  className="flex items-center gap-3 p-3 rounded-lg"
                  style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
                >
                  <div className="flex-1">
                    <p className="font-medium" style={{ color: 'var(--text)' }}>{b.ingredientName}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      → {b.externalName || 'категория'} • Код: {b.externalCode}
                      {b.packAmount != null && b.packUnit ? <> • {b.packAmount} {unitLabel(b.packUnit)}</> : null}
                    </p>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteMapping(b)} aria-label={`Отвязать ${b.ingredientName}`}>
                    <Unlink size={16} />
                    Отвязать
                  </Button>
                </div>
              ))}
            </div>
          )}
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

