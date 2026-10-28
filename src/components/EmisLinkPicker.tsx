import { useEffect, useRef, useState } from 'react';
import { Search, X, Link2, Link2Off } from 'lucide-react';
import { api } from '../api/client';
import type { EmisProduct } from '../types';

interface EmisLinkPickerProps {
  /** Выбранный код позиции ЕМИСС; '' — продукт не привязан (цену ведёт человек). */
  value: string;
  /** Название позиции текущей привязки (ProductResponse.emisName) — до первого поиска. */
  linkedName?: string | null;
  onChange: (code: string, name: string | null) => void;
  disabled?: boolean;
}

function formatPrice(v: number): string {
  return v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPeriod(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

/**
 * Выбор источника цены — позиции локального справочника ЕМИСС (V26/V28).
 *
 * <p>Привязка «софт»: на продукт кладётся только код ({@code ingredients.emis_code}),
 * а цена приходит из локальной копии ЕМИСС во время синхронизации. Поиск идёт по нашей
 * БД (GET /admin/emis/products), поэтому работает и когда портал Росстата недоступен.</p>
 *
 * <p>В списке сразу видны цена и период (боль запусков №14–17: «в результате поиска
 * даже цена не высвечивается» — выбирать позицию вслепую невозможно).</p>
 */
export function EmisLinkPicker({ value, linkedName, onChange, disabled }: EmisLinkPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmisProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const search = async (q: string) => {
    const my = ++seq.current;
    setSearching(true);
    try {
      const data = await api.get<EmisProduct[]>('/admin/emis/products', {
        params: { query: q, limit: '20' },
      });
      if (my !== seq.current) return; // ответ устарел — уже идёт более новый поиск
      setResults(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e: any) {
      if (my !== seq.current) return;
      setResults([]);
      setError(e?.error?.detail ?? e?.message ?? 'Справочник ЕМИСС недоступен');
    } finally {
      if (my === seq.current) setSearching(false);
    }
  };

  // Отменяемый debounce: каждый символ не должен порождать запрос.
  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(query.trim()), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, open]);

  const select = (product: EmisProduct) => {
    onChange(product.code, product.name);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const unlink = () => {
    onChange('', null);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
        Источник цены (ЕМИСС)
      </label>

      {value ? (
        <div
          className="flex items-start gap-2 p-3 rounded-lg"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
        >
          <Link2 size={16} style={{ color: 'var(--wave-300)', marginTop: 2 }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {linkedName || `позиция ${value}`}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Код ЕМИСС: {value} · цена берётся из локальной копии при синхронизации
            </p>
          </div>
          <button
            type="button"
            onClick={unlink}
            disabled={disabled}
            aria-label="Отвязать источник цены"
            className="p-1.5 rounded transition-colors shrink-0"
            style={{ color: 'var(--muted)' }}
            title="Отвязать: цену снова ведёт человек"
          >
            <Link2Off size={16} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={query}
            disabled={disabled}
            onChange={e => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Найдите позицию ЕМИСС: «гречневая», «молоко»…"
            aria-label="Поиск позиции ЕМИСС"
            className="w-full pl-9 pr-8 py-2.5 rounded-lg outline-none"
            style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          {open && (query || results.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setResults([]);
              }}
              aria-label="Закрыть поиск позиции ЕМИСС"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
              style={{ color: 'var(--muted)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {open && !value && (
        <div
          className="mt-2 rounded-lg overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {error ? (
            <p className="p-3 text-sm" style={{ color: 'var(--fire)' }}>{error}</p>
          ) : searching ? (
            <p className="p-3 text-sm" style={{ color: 'var(--muted)' }}>Ищем в локальной копии ЕМИСС…</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm" style={{ color: 'var(--muted)' }}>
              Ничего не найдено. Если позиции нет в справочнике — сначала выполните
              синхронизацию на странице «Интеграции».
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto" data-testid="emis-results">
              {results.map(item => (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => select(item)}
                    aria-label={`Привязать к позиции ${item.name}`}
                    className="w-full text-left px-3 py-2.5 transition-colors"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {item.name}
                    </span>
                    <span className="block text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      Код {item.code}
                      {item.latestPrice != null ? (
                        <>
                          {' · '}
                          <b style={{ color: 'var(--wave-300)' }}>{formatPrice(item.latestPrice)} ₽</b>
                          {item.unitLabel ? ` за ${item.unitLabel}` : ''}
                          {item.latestPriceDate ? ` · ${formatPeriod(item.latestPriceDate)}` : ''}
                        </>
                      ) : (
                        ' · цен в копии пока нет'
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!value && !open && (
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          Не привязан — цену ведёте вы. Привязка включает автоматическую цену из ЕМИСС.
        </p>
      )}
      {value && (
        <p className="text-xs mt-1" style={{ color: 'var(--amber-300, var(--muted))' }}>
          Синхронизация перезапишет цену этого продукта данными ЕМИСС, в том числе
          введённую вручную.
        </p>
      )}
    </div>
  );
}

export default EmisLinkPicker;
