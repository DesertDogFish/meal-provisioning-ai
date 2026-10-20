import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/ToastProvider';
import { Edit2, Trash2, Plus, Check, X } from 'lucide-react';
import { formatAmount } from '../utils/calculations';

interface PriceOverride {
  ingredientId: string;
  ingredientName: string;
  actualPrice: number;
  comment?: string;
}

interface ShoppingItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalAmount: number;
  plannedUnitPrice?: number;
  actualUnitPrice?: number;
  plannedCost?: number;
  actualCost?: number;
  overridden: boolean;
  hasPlannedPrice: boolean;
}

interface Props {
  tripId: string;
}

export default function PriceOverridesTab({ tripId }: Props) {
  const { state } = useApp();
  const { showError, showSuccess } = useToast();
  const [overrides, setOverrides] = useState<PriceOverride[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editComment, setEditComment] = useState('');
  const [loading, setLoading] = useState(false);

  const trip = state.trips.find(t => t.id === tripId);

  useEffect(() => {
    loadOverrides();
    loadShoppingList();
  }, [tripId]);

  const loadOverrides = async () => {
    try {
      const response = await fetch(`/api/v1/trips/${tripId}/price-overrides`);
      if (response.ok) {
        const data = await response.json();
        setOverrides(data);
      }
    } catch (error) {
      console.error('Failed to load overrides:', error);
    }
  };

  const loadShoppingList = async () => {
    try {
      const response = await fetch(`/api/v1/trips/${tripId}/summary/shopping`);
      if (response.ok) {
        const data = await response.json();
        setShoppingItems(data.items);
      }
    } catch (error) {
      console.error('Failed to load shopping list:', error);
    }
  };

  const handleSaveOverride = async (ingredientId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/trips/${tripId}/price-overrides/${ingredientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientId: parseInt(ingredientId),
          actualPrice: parseFloat(editPrice),
          comment: editComment || null
        })
      });

      if (response.ok) {
        await loadOverrides();
        await loadShoppingList();
        setEditingId(null);
        setEditPrice('');
        setEditComment('');
        showSuccess('Цена обновлена');
      } else {
        const error = await response.json();
        showError(error.detail || 'Failed to update price');
      }
    } catch (error) {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOverride = async (ingredientId: string) => {
    if (!confirm('Удалить оверрайд цены?')) return;

    try {
      const response = await fetch(`/api/v1/trips/${tripId}/price-overrides/${ingredientId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadOverrides();
        await loadShoppingList();
        showSuccess('Оверрайд удалён');
      } else {
        const error = await response.json();
        showError(error.detail || 'Failed to delete override');
      }
    } catch (error) {
      showError('Network error');
    }
  };

  const calculateDelta = (planned?: number, actual?: number): string => {
    if (!planned || !actual) return '';
    const delta = ((actual - planned) / planned) * 100;
    return delta.toFixed(1);
  };

  const totalPlanned = shoppingItems.reduce((sum, item) => sum + (item.plannedCost || 0), 0);
  const totalActual = shoppingItems.reduce((sum, item) => sum + (item.actualCost || 0), 0);
  const totalDelta = totalPlanned > 0 ? ((totalActual - totalPlanned) / totalPlanned) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Sticky итог */}
      <div className="sticky top-0 z-10 p-4 rounded-xl" style={{ 
        background: 'rgba(26, 34, 51, 0.95)', 
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border)'
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>План</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                {totalPlanned.toLocaleString('ru-RU')} ₽
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Факт</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                {totalActual.toLocaleString('ru-RU')} ₽
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Дельта</p>
              <p className={`text-xl font-bold ${totalDelta < 0 ? 'text-green-400' : totalDelta > 0 ? 'text-amber-400' : ''}`}
                 style={{ color: totalDelta === 0 ? 'var(--muted)' : undefined }}>
                {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--elev)' }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Продукт</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Кол-во</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>План ₽/ед</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>План ₽</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Факт ₽/ед</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Факт ₽</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Δ</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {shoppingItems.map(item => {
              const override = overrides.find(o => o.ingredientId === item.ingredientId);
              const isEditing = editingId === item.ingredientId;
              const delta = calculateDelta(item.plannedUnitPrice, item.actualUnitPrice);
              const deltaNum = parseFloat(delta);

              return (
                <tr key={item.ingredientId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-3" style={{ color: 'var(--text)' }}>
                    {item.ingredientName}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>
                    {formatAmount(item.totalAmount, item.unit)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>
                    {item.hasPlannedPrice ? item.plannedUnitPrice?.toFixed(2) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>
                    {item.plannedCost?.toLocaleString('ru-RU') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={e => setEditPrice(e.target.value)}
                        className="w-20 px-2 py-1 rounded text-right text-sm"
                        style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        autoFocus
                      />
                    ) : (
                      <span style={{ color: 'var(--text)' }}>
                        {item.actualUnitPrice?.toFixed(2) || '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text)' }}>
                    {item.actualCost?.toLocaleString('ru-RU') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {delta && (
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        deltaNum < 0 ? 'bg-green-500/20 text-green-400' : 
                        deltaNum > 0 ? 'bg-amber-500/20 text-amber-400' : 
                        'bg-slate-500/20'
                      }`} style={{ color: deltaNum === 0 ? 'var(--muted)' : undefined }}>
                        {deltaNum > 0 ? '+' : ''}{delta}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSaveOverride(item.ingredientId)}
                          disabled={loading}
                          className="p-1 rounded hover:bg-emerald-500/20"
                          style={{ color: 'var(--ok)' }}
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditPrice('');
                            setEditComment('');
                          }}
                          className="p-1 rounded hover:bg-red-500/20"
                          style={{ color: 'var(--fire)' }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingId(item.ingredientId);
                            setEditPrice(item.actualUnitPrice?.toString() || '');
                            setEditComment(override?.comment || '');
                          }}
                          className="p-1 rounded hover:bg-emerald-500/20"
                          style={{ color: 'var(--w1)' }}
                        >
                          <Edit2 size={16} />
                        </button>
                        {override && (
                          <button
                            onClick={() => handleDeleteOverride(item.ingredientId)}
                            className="p-1 rounded hover:bg-red-500/20"
                            style={{ color: 'var(--fire)' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
