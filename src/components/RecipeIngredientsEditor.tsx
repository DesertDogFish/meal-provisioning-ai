import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Ingredient, Recipe } from '../types';
import { UNIT_LABELS } from '../types';
import RecipeSearchSelect from './RecipeSearchSelect';

/** Строка черновика состава блюда в окне «Добавить приём пищи». */
export interface DraftIngredient {
  ingredientId: string;
  amount: number;
}

interface Props {
  recipe: Recipe;
  /** Справочник продуктов похода (GET /admin/products|ingredients) */
  products: Ingredient[];
  /** Вызывается при каждой правке черновика (для подсчёта preview-закупки). */
  onChange: (draft: DraftIngredient[]) => void;
  disabled?: boolean;
}

const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/**
 * Правка состава блюда прямо в окне добавления приёма пищи:
 *  - замена продукта — кнопка «Заменить» открывает поиск по справочнику продуктов,
 *    новый продукт занимает строку старого (сохраняется количество);
 *  - добавление продукта — поле поиска + количество; если продукт уже в составе,
 *    количество прибавляется к существующей строке;
 *  - удаление продукта — корзина.
 * Компонент работает с локальным черновиком и ничего не отправляет на сервер —
 * сохранение выполняет родитель (кнопка «Сохранить состав»).
 */
export default function RecipeIngredientsEditor({ recipe, products, onChange, disabled }: Props) {
  const [rows, setRows] = useState<DraftIngredient[]>(() =>
    (recipe.ingredients ?? []).map(ri => ({ ingredientId: ri.ingredientId, amount: ri.amount }))
  );
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [newProductQuery, setNewProductQuery] = useState('');

  // Черновик живёт внутри модалки выбора блюда: при смене блюда редактор
  // пересоздаётся по key, но на всякий случай синхронизируемся с recipe.id.
  useEffect(() => {
    setRows((recipe.ingredients ?? []).map(ri => ({ ingredientId: ri.ingredientId, amount: ri.amount })));
    setReplacingId(null);
    setNewProductQuery('');
  }, [recipe.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Каждое изменение черновика поднимаем родителю (preview закупки/веса)
  useEffect(() => {
    onChange(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const productMap = useMemo(() => new Map(products.map(p => [String(p.id), p])), [products]);

  const nameOf = (id: string): string =>
    productMap.get(String(id))?.name ??
    recipe.ingredients?.find(ri => String(ri.ingredientId) === String(id))?.ingredient?.name ??
    'Неизвестный продукт';

  const unitOf = (id: string) => productMap.get(String(id))?.unit ?? 'PCS';

  const removeRow = (ingredientId: string) => {
    setRows(prev => prev.filter(r => r.ingredientId !== ingredientId));
    if (replacingId === ingredientId) setReplacingId(null);
  };

  const setAmount = (ingredientId: string, raw: string) => {
    const amount = Math.max(0, Number(raw.replace(',', '.')) || 0);
    setRows(prev => prev.map(r => (r.ingredientId === ingredientId ? { ...r, amount } : r)));
  };

  /** Замена продукта: строка остаётся на месте, меняется только ingredientId. */
  const replaceWith = (oldId: string, newId: string) => {
    if (!newId || newId === oldId) { setReplacingId(null); return; }
    setRows(prev => {
      const oldRow = prev.find(r => r.ingredientId === oldId);
      const merged: DraftIngredient[] = [];
      for (const r of prev) {
        if (r.ingredientId === oldId) {
          // Новый продукт занимает строку старого (количество сохраняется в merge ниже)
          const target = merged.find(m => m.ingredientId === newId);
          if (target) target.amount += r.amount;
          else merged.push({ ...r, ingredientId: newId });
        } else if (r.ingredientId === newId && oldRow) {
          const existing = merged.find(m => m.ingredientId === newId);
          if (existing) existing.amount += r.amount;
          else merged.push({ ...r });
        } else {
          const existing = merged.find(m => m.ingredientId === r.ingredientId);
          if (existing) existing.amount += r.amount;
          else merged.push({ ...r });
        }
      }
      return merged;
    });
    setReplacingId(null);
  };

  /** Добавление нового продукта; при повторе — количество прибавляется. */
  const addProduct = (newId: string) => {
    if (!newId) return;
    const amount = Math.max(0, Number(newProductQuery.replace(',', '.')) || 0) || 1;
    setRows(prev => {
      const existing = prev.find(r => r.ingredientId === newId);
      if (existing) {
        return prev.map(r => (r.ingredientId === newId ? { ...r, amount: r.amount + amount } : r));
      }
      return [...prev, { ingredientId: newId, amount }];
    });
    setNewProductQuery('');
  };

  const productOptions = products
    .filter(p => p.enabled !== false)
    .map(p => ({ value: String(p.id), label: p.name, hint: `${UNIT_LABELS[p.unit] ?? p.unit} • ${p.category || 'без категории'}` }));

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
        Состав блюда «{recipe.name}» — можно заменить продукт или добавить новый
      </p>

      {rows.map(row => (
        <div key={row.ingredientId} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }} title={nameOf(row.ingredientId)}>
              {nameOf(row.ingredientId)}
            </span>
            <input
              type="number"
              min={0}
              step="any"
              disabled={disabled}
              value={row.amount}
              onChange={e => setAmount(row.ingredientId, e.target.value)}
              className="w-20 px-2 py-1 rounded text-sm outline-none text-right"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              aria-label={`Количество: ${nameOf(row.ingredientId)}`}
            />
            <span className="text-xs w-7" style={{ color: 'var(--muted)' }}>{UNIT_LABELS[unitOf(row.ingredientId)] ?? ''}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setReplacingId(replacingId === row.ingredientId ? null : row.ingredientId)}
              className="px-2 py-1 text-xs rounded transition-colors"
              style={{ color: 'var(--w1)', border: '1px solid var(--border)' }}
              title="Заменить этот продукт другим из справочника"
            >
              Заменить
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeRow(row.ingredientId)}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--muted)' }}
              title="Убрать продукт из блюда"
              aria-label={`Убрать ${nameOf(row.ingredientId)} из блюда`}
            >
              <Trash2 size={14} />
            </button>
          </div>

          {replacingId === row.ingredientId && (
            <div className="pl-2">
              <RecipeSearchSelect
                value=""
                onChange={(v) => replaceWith(row.ingredientId, v)}
                options={productOptions.filter(o => o.value !== row.ingredientId)}
                placeholder={`Найти замену для «${nameOf(row.ingredientId)}»…`}
                ariaLabel={`Заменить продукт ${nameOf(row.ingredientId)}`}
                emptyText="Продукт не найден"
              />
            </div>
          )}
        </div>
      ))}

      {rows.length === 0 && (
        <p className="text-xs italic" style={{ color: 'var(--fire)' }}>
          В составе не осталось продуктов — добавьте хотя бы один.
        </p>
      )}

      {/* Добавление нового продукта в блюдо */}
      <div className="pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <RecipeSearchSelect
              value=""
              onChange={addProduct}
              options={productOptions}
              placeholder="Добавить продукт из справочника…"
              ariaLabel="Добавить продукт в блюдо"
              emptyText="Продукт не найден"
            />
          </div>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              step="any"
              disabled={disabled}
              value={newProductQuery}
              onChange={e => setNewProductQuery(e.target.value)}
              placeholder="Кол-во"
              className="w-20 px-2 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              aria-label="Количество добавляемого продукта"
            />
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              // Клавиатура: если в поиске набрано имя — выбрать первый совпадающий продукт
              const q = normalize(newProductQuery);
              void q;
            }}
            className="hidden"
          />
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted)' }}>
          <Plus size={12} /> Найдите продукт в списке и укажите количество — оно прибавится, если продукт уже в составе.
        </p>
      </div>
    </div>
  );
}
