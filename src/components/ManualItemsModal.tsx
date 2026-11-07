import { useState } from 'react';
import { PackagePlus, Trash2, X } from 'lucide-react';

import { addManualItem, deleteManualItem, type TripManualItem } from '../api/tripManualItems';
import { formatQty } from '../utils/format';
import type { UnitOfMeasure } from '../types';

import Modal from './Modal';
import { Button } from './Button';
import ProductAddRow from './ProductAddRow';
// Fix-6 (п.13) → bugs-recipes-catalog п.5 (R8): создание продукта из свободного
// ввода — общий компонент (тот же сценарий в редакторе блюда)
import FreeProductCreate, { useProductCategories, normalizeProductName } from './FreeProductCreate';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog'; // Fix-6 (п.7)

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
  /** Fix-6 (п.13): админ может завести продукт, которого нет в справочнике */
  isAdmin?: boolean;
  onClose: () => void;
  /** после успешного добавления/удаления — родитель перечитывает список */
  onChanged: () => void;
}

export default function ManualItemsModal({ tripId, dayId, dayLabel, items, products, isAdmin = false, onClose, onChanged }: Props) {
  const { showError } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [selected, setSelected] = useState<string>('');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Fix-6 (п.13) → bugs-recipes-catalog п.5 (R8): free-text «создать продукт»
  // вынесен в общий FreeProductCreate (его же использует редактор блюда);
  // здесь остаются только запрос/опции; категории — общий хук (один запрос).
  const [addQuery, setAddQuery] = useState('');
  const [extraOptions, setExtraOptions] = useState<Array<{ value: string; label: string; hint?: string; unit?: UnitOfMeasure }>>([]);
  const categories = useProductCategories(isAdmin);

  const allOptions = [...extraOptions, ...products
    .filter(p => p.enabled !== false)
    .map(p => ({ value: String(p.id), label: p.name, hint: p.category || undefined } as { value: string; label: string; hint?: string; unit?: UnitOfMeasure }))];
  const options = allOptions;
  // единица выбранного продукта (созданные на лету помнят свою unit)
  const productUnit: UnitOfMeasure =
    products.find(p => String(p.id) === selected)?.unit
    ?? allOptions.find(o => o.value === selected)?.unit
    ?? 'PCS';
  // предложение «добавить новый продукт»: запрос непустой, ничего не выбрано,
  // точного совпадения по имени в справочнике нет
  const q = normalizeProductName(addQuery);
  const freeQuery = !selected && q.length >= 2 && !options.some(o => normalizeProductName(o.label).includes(q));

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

  const handleDelete = async (itemId: string, itemName: string) => {
    // Fix-6 (п.7): удаление меняет закупку/чек — брендовое предупреждение
    const ok = await confirm({
      title: `Удалить позицию «${itemName}»?`,
      confirmLabel: 'Удалить',
      message: <>Позиция уйдёт из закупки и чека, суммы пересчитаются.</>,
    });
    if (!ok) return;
    try {
      await deleteManualItem(tripId, itemId);
      onChanged();
    } catch (err: any) {
      showError(err?.detail || 'Не удалось удалить позицию');
    }
  };

  // Владелец (07.11.2026): «продукты к дню» → «Доп. закупка».
  const title = dayId == null
    ? 'Доп. закупка на поход'
    : `Доп. закупка${dayLabel ? ` · ${dayLabel}` : ''}`;

  return (
    <Modal onClose={onClose}>
      <div
        className="modal-sheet rounded-2xl shadow-xl w-full max-w-lg p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="dialog"
        aria-label={title}
      >
        <div className="modal-head flex items-start justify-between gap-3 mb-1">
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
                  onClick={() => void handleDelete(mi.id, mi.ingredientName)}
                  className="icon-action p-1 rounded touch-hit"
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

        {/* Форма добавления. bugs-trip-menu-stage п.4: «составной искатель»
            (label «Продукт из справочника» + поиск + сетка «Количество/Примечание»)
            заменён на общий простой блок ProductAddRow — одна строка
            «поиск + кол-во + добавить» без многоуровневых лейблов; free-text
            «создать продукт» (Fix-6 п.13) остаётся доступным из того же поиска. */}
        <div className="space-y-3">
          <ProductAddRow
            options={options}
            value={selected}
            onValueChange={(v) => { setSelected(v); setAddQuery(''); }}
            onQueryChange={setAddQuery}
            amount={amount}
            onAmountChange={setAmount}
            unit={productUnit}
            searchAriaLabel="Продукт ручной позиции"
            searchPlaceholder="Найти продукт…"
            searchEmptyText="Не найдено"
            amountAriaLabel="Количество ручной позиции"
            amountTestId="manual-amount"
            onAdd={() => void handleAdd()}
            addBusy={busy}
            addAriaLabel="Добавить позицию"
          >
            {options.length === 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--fire, #d97706)' }}>
                Справочник продуктов недоступен — добавьте продукт в каталог (админ) и повторите.
              </p>
            )}
            {/* Fix-6 (п.13) → bugs-recipes-catalog п.5 (R8): продукта нет в списке —
                общий блок создания (админ создаёт в справочнике, позиция сразу
                выбирается; не-админу — подсказка). Тот же компонент, что в
                редакторе блюда. */}
            {freeQuery && (
              <FreeProductCreate
                query={addQuery.trim()}
                isAdmin={isAdmin}
                categories={categories}
                testId="manual-create-product"
                onCreated={(np) => {
                  setExtraOptions(prev => prev.some(o => o.value === np.id) ? prev : [...prev, { value: np.id, label: np.name, hint: 'новый продукт', unit: np.unit }]);
                  setSelected(np.id);
                  setAddQuery('');
                }}
              />
            )}
          </ProductAddRow>
          {/* Примечание — компактная строка без лейбла (aria-label + placeholder):
              функциональность сохранена, «лесенки» из подписей нет */}
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            aria-label="Примечание к позиции"
            placeholder="Примечание (необязательно), например: 1 на группу"
            className="w-full px-3 outline-none text-sm"
            style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)', height: 'var(--h-control, 40px)' }}
          />
        </div>

        <div className="modal-foot flex justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>Готово</Button>
        </div>
        {/* Fix-6 (п.7): брендовый диалог подтверждений */}
        {confirmDialog}
      </div>
    </Modal>
  );
}
