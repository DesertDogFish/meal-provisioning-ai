import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import CustomSelect from './CustomSelect';
import { Button } from './Button';
import { useToast } from './ToastProvider';
import { api } from '../api/client';
import { createFreeProduct } from '../api/freeProduct';
import { getCategories, checkProductName } from '../api/products';
import type { UnitOfMeasure } from '../types';

/** Продукт, созданный (или найденный через check-name) из свободного ввода. */
export interface CreatedProduct {
  id: string;
  name: string;
  unit: UnitOfMeasure;
}

/** Нормализация имени для сравнения со справочником («Соль» = «соль», «ё» = «е»). */
export const normalizeProductName = (t: string): string =>
  t.trim().toLowerCase().replace(/ё/g, 'е');

/**
 * Категории продуктов для формы создания (GET /product-categories).
 * Загружаются ОДИН раз на уровне модалки/редактора-хозяина, а не в каждой
 * строке состава (R8); не-админу/офлайн — пустой список, создание недоступно.
 */
export function useProductCategories(isAdmin: boolean): Array<{ id: string; name: string }> {
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getCategories()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : [];
        setCategories(list.map((c: any) => ({ id: String(c.id), name: String(c.name ?? '') })));
      })
      .catch(() => { /* не-админ/офлайн — создание и так недоступно */ });
    return () => { cancelled = true; };
  }, [isAdmin]);
  return categories;
}

interface Props {
  /** Свободный запрос (≥2 символов без совпадения в справочнике) — имя нового продукта */
  query: string;
  isAdmin: boolean;
  /** Справочник категорий (useProductCategories — на уровне хозяина) */
  categories: Array<{ id: string; name: string }>;
  /** Созданный (или найденный check-name'ом) продукт — хозяин выбирает его в строке/опциях */
  onCreated: (p: CreatedProduct) => void;
  /** testid кнопки-предложения: manual-create-product / recipe-create-product */
  testId?: string;
}

/**
 * Fix-6 (п.13) → bugs-recipes-catalog п.5 (R8): общий блок «создать продукт из
 * свободного ввода». Вынесен из ManualItemsModal, чтобы тот же сценарий работал
 * из редактора блюда (RecipeEditorModal): запрос ≥2 символов без совпадения →
 * предложение «создать продукт» (админ) → форма (единица, категория) →
 * GET /admin/products/check-name (дубль — берём existingId) → иначе
 * POST /admin/products → продукт автоматически выбирается у хозяина.
 * Не-админу — подсказка «продукты добавляет администратор».
 */
export default function FreeProductCreate({ query, isAdmin, categories, onCreated, testId = 'create-product' }: Props) {
  const { showError } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [createUnit, setCreateUnit] = useState<UnitOfMeasure>('PCS');
  const [createCategory, setCreateCategory] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateProduct = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const chk = await checkProductName(name, createUnit).catch(() => null);
      let id: string;
      if (chk?.duplicate && chk?.existingId != null) {
        // Паритет с MealCompositionModal.resolveFreeRows: дубль не создаём —
        // выбираем существующий продукт.
        id = String(chk.existingId);
      } else {
        const categoryId = createCategory || categories[0]?.id;
        if (!categoryId) {
          showError('Не выбрана категория для нового продукта');
          return;
        }
        const created = await createFreeProduct({ name, unit: createUnit, categoryId: Number(categoryId) });
        if (created?.id == null) throw new Error('Сервер не вернул id продукта');
        id = String(created.id);
      }
      setShowCreate(false);
      onCreated({ id, name, unit: createUnit });
    } catch (err: any) {
      showError(err?.detail || err?.message || 'Не удалось завести продукт');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg px-3 py-2"
      style={{ background: 'color-mix(in srgb, var(--wave-400) 8%, transparent)', border: '1px dashed var(--line-strong)' }}>
      {!showCreate ? (
        isAdmin ? (
          <button type="button" className="text-xs font-bold underline-offset-2 hover:underline"
            style={{ color: 'var(--w1)' }}
            onClick={() => setShowCreate(true)}
            aria-label={`Добавить «${query}» как новый продукт`}
            data-testid={testId}>
            «{query}» нет в справочнике — добавить как новый продукт
          </button>
        ) : (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            «{query}» нет в справочнике. Новые продукты добавляет администратор
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
  );
}
