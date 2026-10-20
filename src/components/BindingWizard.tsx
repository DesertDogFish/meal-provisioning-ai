import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from './ToastProvider';
import { X, ChevronRight, SkipForward } from 'lucide-react';
import { NumberField } from './NumberField';

interface Candidate {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  packAmount: number | null;
  packUnit: string | null;
  score: number;
}

interface UnboundItem {
  id: string;
  name: string;
  unit: string;
  usageRecipes: number;
  moneyWeight: number;
}

interface Props {
  onClose: () => void;
}

export function BindingWizard({ onClose }: Props) {
  const { state } = useApp();
  const { showSuccess, showError } = useToast();
  const [queue, setQueue] = useState<UnboundItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [suggestions, setSuggestions] = useState<Candidate[]>([]);
  const [pack, setPack] = useState<{ amount: number | null; unit: string } | null>(null);
  const [round, setRound] = useState(true);
  const [manual, setManual] = useState('');
  const [loading, setLoading] = useState(false);

  const cur = queue[idx];

  useEffect(() => {
    loadUnboundIngredients();
  }, []);

  useEffect(() => {
    if (cur) {
      loadSuggestions(cur.id);
      setPack(null);
      setManual('');
    }
  }, [cur?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 's' || e.key === 'ы') skip();
      if (['1', '2', '3'].includes(e.key) && suggestions[+e.key - 1]) {
        pick(suggestions[+e.key - 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [suggestions, idx]);

  const loadUnboundIngredients = async () => {
    try {
      const response = await fetch('/api/v1/admin/ingredients?bound=false&sort=moneyWeight', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setQueue(data.items || []);
      }
    } catch (error) {
      console.error('Failed to load unbound ingredients:', error);
    }
  };

  const loadSuggestions = async (ingredientId: string) => {
    try {
      const response = await fetch(
        `/api/v1/admin/integrations/off/suggest?ingredientId=${ingredientId}&limit=3`,
        { headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const bind = async (externalCode: string, packSize: number | null, packUnit: string | null) => {
    if (!cur) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/ingredients/${cur.id}/binding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          externalCode,
          packSize,
          packUnit,
          roundToPacks: round && packSize != null
        })
      });

      if (response.ok) {
        showSuccess('Привязка создана');
        next();
      } else {
        const error = await response.json();
        showError(error.detail || 'Failed to bind');
      }
    } catch (error) {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const parsePack = (q: string | null): { amount: number; unit: string } | null => {
    if (!q) return null;
    const s = q.toLowerCase().replace(',', '.');
    const multi = s.match(/(\d+)\s*x\s*([\d.]+)\s*(g|г|кг|kg|ml|мл|l|л)/);
    let n = 1, v: number, u: string;
    if (multi) {
      n = +multi[1];
      v = +multi[2];
      u = multi[3];
    } else {
      const m = s.match(/([\d.]+)\s*(g|г|кг|kg|ml|мл|l|л)/);
      if (!m) return null;
      v = +m[1];
      u = m[2];
    }
    const kg = u === 'кг' || u === 'kg';
    const g = u === 'g' || u === 'г';
    const amount = n * (kg ? v : g ? v / 1000 : u === 'мл' || u === 'ml' ? v / 1000 : v);
    return { amount: +amount.toFixed(4), unit: kg || g ? 'KG' : 'L' };
  };

  const pick = (c: Candidate) => {
    const parsed = c.packAmount ? { amount: c.packAmount, unit: c.packUnit! } : parsePack(c.quantity);
    setPack(parsed);
    bind(c.code, c.packAmount ?? parsePack(c.quantity)?.amount ?? null, c.packUnit ?? parsePack(c.quantity)?.unit ?? null);
  };

  const next = () => setIdx(i => i + 1);
  const skip = () => {
    setSkipped(s => s + 1);
    next();
  };

  if (!cur) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <b style={{ fontFamily: 'Unbounded', fontSize: '15px', color: 'var(--text)' }}>Каталог привязан</b>
          <p style={{ color: 'var(--muted)', margin: '10px 0' }}>
            Пропущено: {skipped}. К ним можно вернуться позже — у них останется ручная цена.
          </p>
          <button className="grad-btn" onClick={onClose}>Готово</button>
        </div>
      </div>
    );
  }

  const total = queue.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <b style={{ fontFamily: 'Unbounded', fontSize: '15px', color: 'var(--text)' }}>Привязка каталога</b>
          <span style={{ color: 'var(--muted)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
            {idx + 1} / {total} · пропущено {skipped}
          </span>
        </div>

        {/* Прогресс-бар */}
        <div style={{ height: '6px', borderRadius: '3px', margin: '12px 0', background: 'var(--elev)' }}>
          <div
            style={{
              height: '6px',
              borderRadius: '3px',
              width: `${(idx / Math.max(total, 1)) * 100}%`,
              background: 'linear-gradient(90deg, var(--w1), var(--w2))'
            }}
          />
        </div>

        {/* Текущий компонент */}
        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}>
          <b style={{ color: 'var(--text)' }}>{cur.name}</b>
          <span className="chip-delta dim" style={{ marginLeft: '8px' }}>{cur.unit}</span>
          <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
            в рецептах: {cur.usageRecipes} · доля денег походов: {cur.moneyWeight}%
          </p>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '6px' }}>
          Клавиши: 1–3 привязать кандидат, S пропустить
        </p>

        {/* Кандидаты */}
        {suggestions.map((c, i) => (
          <div
            key={c.code}
            className="flex gap-3 items-center py-2"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            <span className="chip-delta dim">{i + 1}</span>
            <span style={{ flex: 1, color: 'var(--text)' }}>
              {c.name}
              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                {' '}· {c.brand ?? ''} · {c.quantity ?? 'упаковка не распознана'}
              </span>
            </span>
            <span style={{ color: 'var(--muted)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(c.score * 100)}%
            </span>
            <button
              className="ghost-btn"
              onClick={() => pick(c)}
              disabled={loading}
            >
              Привязать
            </button>
          </div>
        ))}

        {/* Упаковка */}
        <div className="flex gap-3 items-center mt-4">
          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Упаковка:</span>
          <NumberField
            value={pack?.amount ?? null}
            stepRef={pack?.amount ?? 1}
            maxDecimals={4}
            minStep={0.001}
            onCommit={v => setPack(p => ({ amount: v, unit: p?.unit ?? 'KG' }))}
            testId="pack-amount"
          />
          <span className="chip-delta dim">{pack?.unit ?? cur.unit}</span>
          <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--muted)', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={round}
              onChange={e => setRound(e.target.checked)}
            />
            округлять закупку до упаковок
          </label>
        </div>

        {/* Ручной ввод */}
        <div className="flex gap-3 mt-4">
          <input
            placeholder="или введите штрихкод вручную"
            value={manual}
            onChange={e => setManual(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg outline-none"
            style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <button
            className="ghost-btn"
            disabled={!manual || loading}
            onClick={() => bind(manual, pack?.amount ?? null, pack?.unit ?? null)}
          >
            ОК
          </button>
          <button
            className="ghost-btn"
            onClick={skip}
            disabled={loading}
          >
            Пропустить (S)
          </button>
        </div>
      </div>
    </div>
  );
}
