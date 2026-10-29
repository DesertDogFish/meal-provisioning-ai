import { useEffect, useState } from 'react';
import { PackagePlus, Plus, Trash2, X } from 'lucide-react';
import Modal from './Modal';
import { Button } from './Button';
import RecipeSearchSelect from './RecipeSearchSelect';
import AmountInput from './AmountInput';
import CustomSelect from './CustomSelect';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog'; // Fix-6 (п.7)
import { addManualItem, deleteManualItem, type TripManualItem } from '../api/tripManualItems';
import { api } from '../api/client';
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

  // Fix-6 (п.13): свободный ввод — «а если продукта нет в списке?»
  const [addQuery, setAddQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createUnit, setCreateUnit] = useState<UnitOfMeasure>('PCS');
  const [createCategory, setCreateCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const [extraOptions, setExtraOptions] = useState<Array<{ value: string; label: string; hint?: string; unit?: UnitOfMeasure }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api.get<any>('/product-categories')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.content ?? []);
        setCategories(list.map((c: any) => ({ id: String(c.id), name: String(c.name ?? '') })));
      })
      .catch(() => { /* не-админ/офлайн — создание и так недоступно */ });
    return () => { cancelled = true; };
  }, [isAdmin]);

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
  const normalize = (t: string) => t.trim().toLowerCase().replace(/ё/g, 'е');
  const q = normalize(addQuery);
  const freeQuery = !selected && q.length >= 2 && !options.some(o => normalize(o.label).includes(q));

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

  /**
   * Fix-6 (п.13): продукта нет в справочнике — завести (админ) и сразу выбрать.
   * Паритет с MealCompositionModal.resolveFreeRows: check-name → существующий id;
   * иначе POST /admin/products с выбранной категорией.
   */
  const handleCreateProduct = async () => {
    const name = addQuery.trim();
    if (!name) return;
    setCreating(true);
    try {
      const chk = await api.get<any>(
        `/admin/products/check-name?name=${encodeURIComponent(name)}&unit=${encodeURIComponent(createUnit)}`
      ).catch(() => null);
      let id: string;
      if (chk?.duplicate && chk?.existingId != null) {
        id = String(chk.existingId);
      } else {
        const categoryId = createCategory || categories[0]?.id;
        if (!categoryId) {
          showError('Не выбрана категория для нового продукта');
          return;
        }
        const created = await api.post<any>('/admin/products', { name, unit: createUnit, categoryId: Number(categoryId) });
        if (created?.id == null) throw new Error('Сервер не вернул id продукта');
        id = String(created.id);
      }
      setExtraOptions(prev => prev.some(o => o.value === id) ? prev : [...prev, { value: id, label: name, hint: 'новый продукт', unit: createUnit }]);
      setSelected(id);
      setShowCreate(false);
      setAddQuery('');
    } catch (err: any) {
      showError(err?.detail || err?.message || 'Не удалось завести продукт');
    } finally {
      setCreating(false);
    }
  };

  const title = dayId == null
    ? 'Продукты к походу'
    : `Продукты к дню${dayLabel ? ` · ${dayLabel}` : ''}`;

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
              onChange={(v) => { setSelected(v); setAddQuery(''); setShowCreate(false); }}
              onQueryChange={setAddQuery}
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
            {/* Fix-6 (п.13): продукта нет в списке — предложить добавить (админ создаёт
                в справочнике и позиция сразу выбирается; не-админу — подсказка) */}
            {freeQuery && (
              <div className="mt-2 rounded-lg px-3 py-2"
                style={{ background: 'color-mix(in srgb, var(--wave-400) 8%, transparent)', border: '1px dashed var(--line-strong)' }}>
                {!showCreate ? (
                  isAdmin ? (
                    <button type="button" className="text-xs font-bold underline-offset-2 hover:underline"
                      style={{ color: 'var(--w1)' }}
                      onClick={() => setShowCreate(true)}
                      aria-label={`Добавить «${addQuery.trim()}» как новый продукт`}
                      data-testid="manual-create-product">
                      «{addQuery.trim()}» нет в справочнике — добавить как новый продукт
                    </button>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      «{addQuery.trim()}» нет в справочнике. Новые продукты добавляет администратор
                      (вкладка «Продукты») — после этого позиция станет доступна.
                    </p>
                  )
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Единица</label>
                      <CustomSelect
                        value={createUnit}
                        onChange={(v) => setCreateUnit(v as UnitOfMeasure)}
                        options={[{ value: 'PCS', label: 'шт' }, { value: 'KG', label: 'кг' }, { value: 'L', label: 'л' }, { value: 'PACK', label: 'уп' }]}
                        ariaLabel="Единица нового продукта"
                      />
                    </div>
                    <div className="flex-1" style={{ minWidth: 140 }}>
                      <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Категория</label>
                      <CustomSelect
                        value={createCategory}
                        onChange={setCreateCategory}
                        options={categories.map(c => ({ value: c.id, label: c.name }))}
                        placeholder="Выберите категорию"
                        ariaLabel="Категория нового продукта"
                      />
                    </div>
                    <Button size="sm" variant="primary" disabled={creating} onClick={() => void handleCreateProduct()}>
                      <Plus size={14} /> {creating ? 'Добавляем…' : 'Добавить'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Отмена</Button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Fix-4 (п.1): единая линия контролов — одинаковая высота (40px),
              один радиус (--r-input), кнопка того же роста: больше нет «лесенки» */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Количество</label>
              <AmountInput
                value={amount}
                unit={productUnit}
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

        <div className="modal-foot flex justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>Готово</Button>
        </div>
        {/* Fix-6 (п.7): брендовый диалог подтверждений */}
        {confirmDialog}
      </div>
    </Modal>
  );
}
