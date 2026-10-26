import { useState } from 'react';
import { PackagePlus, Plus, Trash2, X } from 'lucide-react';
import Modal from './Modal';
import { Button } from './Button';
import RecipeSearchSelect from './RecipeSearchSelect';
import AmountInput from './AmountInput';
import { useToast } from './ToastProvider';
import { addManualItem, deleteManualItem, type TripManualItem } from '../api/tripManualItems';
import { formatQty } from '../utils/format';
import type { UnitOfMeasure } from '../types';

/**
 * U40 (список 26.10) / PLAN R3 (mock+UI-часть): ручные позиции закупки —
 * продукты к дню или ко всему походу ВНЕ блюд (антисептик, аптечка, топливо).
 *
 * Количество — абсолют (шт/кг/л на день или поход), НЕ на порцию.
 * Позиции вливаются в «Закупка на поход», «Закупка по дням» и «Чеклист»
 * (см. utils/manualItems.ts). Хранение — сервер (mock: in-memory; backend-задача R3).
 */

export interface ManualProductOption {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  category?: string;
  enabled?: boolean;
}

interface Props {
  tripId: string;
  /** null = позиции на весь поход */
  dayId: string | null;
  dayLabel?: string;
  /** уже добавленные позиции этой области (день/поход) */
  items: TripManualItem[];
  products: ManualProductOption[];
  onClose: () => void;
  /** после успешного добавления/удаления — родитель перечитывает список */
  onChanged: () => void;
}

export default function ManualItemsModal({ tripId, dayId, dayLabel, items, products, onClose, onChanged }: Props) {
  const { showError } = useToast();
  const [selected, setSelected] = useState<string>('');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const product = products.find(p => String(p.id) === selected);
  const options = products
    .filter(p => p.enabled !== false)
    .map(p => ({ value: String(p.id), label: p.name, hint: p.category || undefined }));

  const handleAdd = async () => {
    if (!selected || !(amount != null && amount > 0)) {
      showError('Выберите продукт и укажите количество больше нуля');
      return;
    }
    setBusy(true);
    try {
      await addManualItem(tripId, { dayId, ingredientId: selected, amount, note: note.trim() || undefined });
      setSelected(''); setAmount(null); setNote('');
      onChanged();
    } catch (err: any) {
      showError(err?.detail || 'Не удалось добавить позицию');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteManualItem(tripId, itemId);
      onChanged();
    } catch (err: any) {
      showError(err?.detail || 'Не удалось удалить позицию');
    }
  };

  const title = dayId == null
    ? 'Продукты к походу'
    : `Продукты к дню${dayLabel ? ` · ${dayLabel}` : ''}`;

  return (
    <Modal onClose={onClose}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-lg p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <PackagePlus size={18} /> {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть"
            className="p-2 rounded-lg transition-colors shrink-0" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          Всё, что не входит в блюда: аптечка, антисептик, топливо… Количество — абсолют
          {dayId == null ? ' на весь поход' : ' на день'}; позиции попадут в закупку и чеклист.
        </p>

        {/* Уже добавленные позиции */}
        {items.length > 0 && (
          <ul className="mb-4 space-y-1" aria-label="Добавленные позиции">
            {items.map(mi => (
              <li key={mi.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
                  style={{ background: 'var(--elev)', color: 'var(--text)' }}>
                <span className="flex-1">
                  {mi.ingredientName} · {formatQty(mi.amount, mi.unit)}
                  {mi.note && <span style={{ color: 'var(--muted)' }}> — {mi.note}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Удалить позицию: ${mi.ingredientName}`}
                  onClick={() => void handleDelete(mi.id)}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--muted)' }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length === 0 && (
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Пока ничего не добавлено.</p>
        )}

        {/* Форма добавления */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Продукт из справочника</label>
            <RecipeSearchSelect
              value={selected}
              onChange={setSelected}
              options={options}
              placeholder="Найти продукт…"
              emptyText="Не найдено"
              ariaLabel="Продукт ручной позиции"
            />
            {options.length === 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--fire, #d97706)' }}>
                Справочник продуктов недоступен — добавьте продукт в каталог (админ) и повторите.
              </p>
            )}
          </div>
          {/* Fix-4 (п.1): единая линия контролов — одинаковая высота (40px),
              один радиус (--r-input), кнопка того же роста: больше нет «лесенки» */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Количество</label>
              <AmountInput
                value={amount}
                unit={product?.unit ?? 'PCS'}
                onChange={setAmount}
                ariaLabel="Количество ручной позиции"
                testId="manual-amount"
              />
            </div>
            <div className="flex-1" style={{ minWidth: 160 }}>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Примечание (необязательно)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                aria-label="Примечание к позиции"
                placeholder="например, 1 на группу"
                className="w-full px-3 outline-none text-sm"
                style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)', height: 'var(--h-control, 40px)' }}
              />
            </div>
            <Button variant="primary" onClick={() => void handleAdd()} disabled={busy} aria-label="Добавить позицию"
                    className="self-end" style={{ height: 'var(--h-control, 40px)' }}>
              <Plus size={14} /> Добавить
            </Button>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>Готово</Button>
        </div>
      </div>
    </Modal>
  );
}
