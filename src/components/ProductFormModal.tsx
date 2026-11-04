import { useState, useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import { useToast } from './ToastProvider';
import Modal from './Modal';
import { NumberField } from './NumberField';
import CustomSelect from './CustomSelect';
import { DatePicker } from './DatePicker';
import { EmisLinkPicker } from './EmisLinkPicker';
import { Button } from './Button';
import { api } from '../api/client';
import type { UnitOfMeasure, ProductCategory, IngredientPrice } from '../types';
import { humanizeUnit, recipesWord, productsWord, categoriesWord } from '../utils/text';

export interface ProductFormModalProduct {
  id?: string | number;
  name?: string;
  categoryId?: string | number | null;
  unit?: UnitOfMeasure;
  packSize?: number | null;
  roundToPacks?: boolean;
  kcalPer100g?: number | null;
  pieceWeightG?: number | null;
  emisCode?: string | null;
  emisName?: string | null;
  currentPrice?: { value?: number } | null;
}

export interface ProductFormModalProps {
  /** Редактируемый продукт; null/undefined = создание нового. */
  product?: ProductFormModalProduct | null;
  /** Алиас для product (совместимость с хостом). */
  editingProduct?: ProductFormModalProduct | null;
  initialProduct?: ProductFormModalProduct | null;
  categories?: ProductCategory[];
  priceByIngredient?: Record<string, number>;
  prices?: Record<string, number>;
  /** Если false — ничего не рендерим (контролируемое открытие). */
  open?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  onSaved?: () => void | Promise<void>;
  onSave?: () => void | Promise<void>;
  onSubmitted?: () => void | Promise<void>;
}

const normalizeProduct = (p?: ProductFormModalProduct | null) => p ?? null;

export default function ProductFormModal(props: ProductFormModalProps) {
  const {
    product,
    editingProduct,
    initialProduct,
    categories = [],
    priceByIngredient,
    prices,
    open,
    onClose,
    onCancel,
    onDismiss,
  } = props;

  const editing = normalizeProduct(product ?? editingProduct ?? initialProduct ?? null);
  const close = onClose ?? onCancel ?? onDismiss;
  const priceMap = priceByIngredient ?? prices ?? {};

  const { showError, showSuccess } = useToast();

  const [formName, setFormName] = useState(editing?.name ?? '');
  const [formCategory, setFormCategory] = useState<string>(editing?.categoryId != null ? String(editing.categoryId) : '');
  const [formUnit, setFormUnit] = useState<UnitOfMeasure>(editing?.unit ?? 'KG');
  const [formPackSize, setFormPackSize] = useState<number | null>(editing?.packSize ?? null);
  const [formRoundToPacks, setFormRoundToPacks] = useState<boolean>(editing?.roundToPacks ?? false);
  const [formCalories, setFormCalories] = useState<number | null>(editing?.kcalPer100g ?? null);
  const [formPieceWeightG, setFormPieceWeightG] = useState<number | null>(editing?.pieceWeightG ?? null);
  const [formPrice, setFormPrice] = useState('');
  const [formPriceDate, setFormPriceDate] = useState('');
  const [formEmisCode, setFormEmisCode] = useState<string>(editing?.emisCode ?? '');
  const [formEmisName, setFormEmisName] = useState<string | null>(editing?.emisName ?? null);
  const [emisPriceSeries, setEmisPriceSeries] = useState<any[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<{ type: 'hard' | 'soft'; message: string } | null>(null);
  useEffect(() => {
    if (!editing?.emisCode) { setEmisPriceSeries([]); return; }
    let cancelled = false;
    api.get(`/admin/emis/products/${editing.emisCode}/prices`)
      .then((data: any) => { if (!cancelled) setEmisPriceSeries(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setEmisPriceSeries([]); });
    return () => { cancelled = true; };
  }, [editing?.emisCode]);

  // синхронизация при смене редактируемого продукта
  const lastEditingId = useRef<string | number | null | undefined>(editing?.id);
  useEffect(() => {
    if (lastEditingId.current === editing?.id) return;
    lastEditingId.current = editing?.id;
    setFormName(editing?.name ?? '');
    setFormCategory(editing?.categoryId != null ? String(editing.categoryId) : '');
    setFormUnit(editing?.unit ?? 'KG');
    setFormPackSize(editing?.packSize ?? null);
    setFormRoundToPacks(editing?.roundToPacks ?? false);
    setFormCalories(editing?.kcalPer100g ?? null);
    setFormPieceWeightG(editing?.pieceWeightG ?? null);
    setFormPrice('');
    setFormPriceDate(editing ? new Date().toISOString().slice(0, 10) : '');
    setFormEmisCode(editing?.emisCode ?? '');
    setFormEmisName(editing?.emisName ?? null);
    setDuplicateWarning(null);
  }, [editing?.id]);

  // первичная цена при редактировании — не подставляем, как в оригинале
  useEffect(() => {
    if (editing) {
      setFormPrice('');
      setFormPriceDate(new Date().toISOString().slice(0, 10));
    }
  }, []);

  const dupCheckSeq = useRef(0);
  const dupDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkDuplicate = async (name: string, unit: UnitOfMeasure) => {
    const seq = ++dupCheckSeq.current;
    if (!name) {
      setDuplicateWarning(null);
      return;
    }
    try {
      const response = await api.get<any>(
        `/admin/products/check-name?name=${encodeURIComponent(name)}&unit=${unit}`
      );
      if (seq !== dupCheckSeq.current) return;
      if (response.duplicate) {
        if (response.sameUnit) {
          setDuplicateWarning({ type: 'hard', message: `Продукт «${response.existingName}» (${humanizeUnit(unit)}) уже существует.` });
        } else {
          setDuplicateWarning({ type: 'soft', message: `Есть «${response.existingName}» в другой единице. Создаёте отдельный продукт (${humanizeUnit(unit)})?` });
        }
      } else {
        setDuplicateWarning(null);
      }
    } catch (error) {
      if (seq !== dupCheckSeq.current) return;
      console.error('Failed to check duplicate:', error);
      showError('Не удалось проверить наличие такого же продукта');
    }
  };

  const scheduleDuplicateCheck = (name: string, unit: UnitOfMeasure) => {
    if (dupDebounce.current) clearTimeout(dupDebounce.current);
    dupDebounce.current = setTimeout(() => checkDuplicate(name, unit), 300);
  };

  const emisCurrentPrice = useMemo(() => {
    const n = Number(String(formPrice).replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
    return (editing?.currentPrice?.value ?? null);
  }, [formPrice, editing]);

  if (open === false) return null;

  const handleClose = () => {
    close?.();
  };

  const handleSave = async () => {
    if (!formName || !formCategory) {
      showError('Заполните обязательные поля');
      return;
    }
    if (duplicateWarning?.type === 'hard') {
      showError('Продукт с таким именем и единицей уже существует');
      return;
    }
    if ((formUnit === 'PCS' || formUnit === 'PACK') && formCalories && !formPieceWeightG) {
      showError('Для шт/уп с калорийностью обязателен вес 1 шт/уп в граммах');
      return;
    }

    try {
      const body = {
        name: formName,
        categoryId: parseInt(formCategory),
        unit: formUnit,
        packSize: formPackSize,
        roundToPacks: formRoundToPacks,
        kcalPer100g: formCalories,
        pieceWeightG: formPieceWeightG,
        emisCode: formEmisCode.trim() || null,
      };

      let savedId: string | number | undefined = editing?.id;
      if (editing) {
        await api.put(`/admin/products/${editing.id}`, body);
        showSuccess('Продукт обновлён');
      } else {
        const created = await api.post<{ id?: string | number }>('/admin/products', body);
        savedId = created?.id ?? savedId;
        showSuccess('Продукт создан');
      }

      const priceVal = Number(formPrice.replace(',', '.'));
      if (formPrice.trim() && savedId != null) {
        if (!(priceVal > 0)) {
          showError('Цена должна быть числом больше нуля');
        } else {
          try {
            await api.post('/admin/ingredient-prices', {
              ingredientId: savedId,
              pricePerUnit: priceVal,
              currency: 'RUB',
              effectiveFrom: formPriceDate || new Date().toISOString().slice(0, 10),
            });
            showSuccess('Цена установлена');
          } catch (priceErr: any) {
            showError(priceErr?.error?.detail || priceErr?.detail || 'Продукт сохранён, но цену установить не удалось');
          }
        }
      }

      const cb = props.onSaved ?? props.onSave ?? props.onSubmitted;
      if (cb) await cb();
      handleClose();
    } catch (error: any) {
      const raw = String(error?.message ?? '') + ' ' + String(error?.error?.detail ?? error?.detail ?? '');
      if (raw.includes('DUPLICATE_PRODUCT') || /already exists/i.test(raw)) {
        showError('Продукт с таким названием и единицей измерения уже существует.');
      } else {
        showError(error?.error?.detail || error?.detail || error?.message || 'Ошибка сохранения');
      }
    }
  };

  return (
    <Modal onClose={handleClose}>
      <div className="modal-sheet rounded-2xl shadow-xl w-full max-w-md p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {editing ? 'Редактировать продукт' : 'Новый продукт'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Закрыть"
            className="p-2 rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Название *
            </label>
            <input
              type="text"
              value={formName}
              onChange={e => {
                setFormName(e.target.value);
                scheduleDuplicateCheck(e.target.value, formUnit);
              }}
              className="w-full px-3 py-2.5 rounded-lg outline-none"
              style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder="Например: Гречка ядрица"
            />
            {duplicateWarning && (
              <div className="mt-2 p-3 rounded-lg text-sm" style={{
                background: duplicateWarning.type === 'hard' ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'color-mix(in srgb, var(--amber-500) 10%, transparent)',
                border: `1px solid ${duplicateWarning.type === 'hard' ? 'color-mix(in srgb, var(--danger) 30%, transparent)' : 'color-mix(in srgb, var(--amber-500) 30%, transparent)'}`,
                color: duplicateWarning.type === 'hard' ? 'var(--danger)' : 'var(--amber-300)'
              }}>
                {duplicateWarning.message}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Категория *
            </label>
            <CustomSelect
              value={formCategory}
              onChange={setFormCategory}
              options={categories.map(cat => ({ value: String(cat.id), label: cat.name }))}
              placeholder="Выберите категорию..."
              ariaLabel="Категория"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Единица измерения *
            </label>
            <div className="flex gap-1.5" role="group" aria-label="Единица измерения">
              {(['KG', 'L', 'PCS', 'PACK'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => {
                    setFormUnit(u);
                    scheduleDuplicateCheck(formName, u);
                  }}
                  aria-pressed={formUnit === u}
                  className="px-3.5 py-1.5 text-sm font-semibold transition-all"
                  style={{
                    borderRadius: 'var(--r-input, 8px)',
                    background: formUnit === u ? 'var(--grad-brand)' : 'transparent',
                    border: formUnit === u ? '1px solid transparent' : '1px solid var(--border)',
                    color: formUnit === u ? 'var(--on-fire)' : 'var(--text-2)'
                  }}
                >
                  {u === 'KG' ? 'кг' : u === 'L' ? 'л' : u === 'PCS' ? 'шт' : 'уп'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Калорийность на 100 г / 100 мл (опционально)
            </label>
            <NumberField
              value={formCalories}
              stepRef={formCalories ?? 100}
              maxDecimals={0}
              onCommit={v => setFormCalories(v)}
              placeholder="ккал"
              ariaLabel="Калорийность на 100 г или 100 мл"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Как на упаковке. Можно оставить пустым.</p>
          </div>

          {(formUnit === 'PCS' || formUnit === 'PACK') && (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                Вес 1 {formUnit === 'PCS' ? 'шт' : 'уп'}, г{formCalories ? ' *' : ''}
              </label>
              <NumberField
                value={formPieceWeightG}
                stepRef={formPieceWeightG ?? 100}
                maxDecimals={0}
                onCommit={v => setFormPieceWeightG(v)}
                placeholder={formUnit === 'PCS' ? "325" : "600"}
                ariaLabel={`Вес одной штуки или упаковки в граммах`}
              />
              {formCalories ? (
                <p className="text-xs mt-1" style={{ color: 'var(--fire)' }}>
                  ⚠ Обязательно: без веса ккал для шт/уп не рассчитать
                </p>
              ) : (
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  Например: 325 для банки тушёнки, 600 для блока лапши
                </p>
              )}
            </div>
          )}

          <EmisLinkPicker
            value={formEmisCode}
            linkedName={formEmisName}
            unit={formUnit}
            pieceWeightG={formPieceWeightG}
            currentPrice={emisCurrentPrice}
            onChange={(code, name) => {
              setFormEmisCode(code);
              setFormEmisName(name);
            }}
          />

          {emisPriceSeries.length > 0 && (
            <div className="mt-2" data-testid="emis-price-chart">
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>История цены ЕМИСС (по месяцам)</p>
              <svg width="100%" height="80" viewBox={`0 0 ${Math.max(emisPriceSeries.length, 1)} 80`} preserveAspectRatio="none">
                {emisPriceSeries.map((p, i) => {
                  const max = Math.max(...emisPriceSeries.map(x => Number(x.price) || 0), 1);
                  const h = ((Number(p.price) || 0) / max) * 70;
                  return <rect key={i} x={i} y={80 - h} width={0.8} height={h} fill="var(--wave-300)" />;
                })}
              </svg>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              {editing
                ? `Цена, ₽ за ${formUnit === 'KG' ? 'кг' : formUnit === 'L' ? 'л' : formUnit === 'PCS' ? 'шт' : 'уп'}${priceMap[String(editing.id)] != null ? ` (сейчас ${priceMap[String(editing.id)]})` : ' (сейчас не задана)'}`
                : `Цена при создании, ₽ за ${formUnit === 'KG' ? 'кг' : formUnit === 'L' ? 'л' : formUnit === 'PCS' ? 'шт' : 'уп'} (опционально)`}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={formPrice}
                onChange={e => setFormPrice(e.target.value)}
                placeholder="например, 210"
                aria-label="Цена"
                className="flex-1 px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <div style={{ width: 170 }}>
                <DatePicker
                  value={formPriceDate || null}
                  onChange={setFormPriceDate}
                  placeholder="Дата действия цены"
                />
              </div>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Пусто = не менять. Новая цена добавляется срезом с даты (история сохраняется).
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="ghost" size="sm" onClick={handleClose}>Отмена</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!formName || !formCategory || duplicateWarning?.type === 'hard'} aria-label="Сохранить продукт">Сохранить</Button>
        </div>
      </div>
    </Modal>
  );
}

// Именованный экспорт для совместимости с тестами/импортами.
export { ProductFormModal as ProductFormModalComponent };
export { ProductFormModal };
