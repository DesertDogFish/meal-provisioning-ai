import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from './Button';
import Modal from './Modal';
import { api } from '../api/client';
import { useToast } from './ToastProvider';
import { validateRecipe } from '../utils/validation';
import AmountInput from './AmountInput';
import type { MealType, UnitOfMeasure } from '../types';

/**
 * Редактор блюда для ADMIN: создание и редактирование (включая состав).
 * Справочник блюд меняется только здесь; правки состава отдельного приёма пищи
 * в походе живут в trip_meal_adjustments (см. эпик «Закупки») и к этому редактору
 * отношения не имеют.
 *
 * Контракты: POST /admin/recipes, PUT /admin/recipes/{id} (RecipeRequest:
 * name, mealType, category, cookMinutes, baseServings, ingredients[{ingredientId, amount}]).
 * caloriesPerServing не отправляем — deprecated, считается на бэке из продуктов (CR-1).
 */

export interface EditorProduct {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  kcalPer100g?: number | null;
  pieceWeightG?: number | null;
}

export interface EditableRecipe {
  id: string;
  name: string;
  mealType: MealType;
  category?: string;
  cookMinutes?: number;
  baseServings: number;
  ingredients: Array<{
    ingredientId: string | number;
    amount: number;
    ingredient?: { name?: string; unit?: string } | null;
  }>;
}

interface Row {
  key: number;
  ingredientId: string | number | null; // как пришёл из API: number (real) / string (mock)
  query: string;
  amount: string;
}

interface Props {
  recipe: EditableRecipe | null; // null = создание
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}

const MEAL_TYPES: Array<{ value: MealType; label: string }> = [
  { value: 'BREAKFAST', label: 'Завтрак' },
  { value: 'LUNCH', label: 'Обед' },
  { value: 'DINNER', label: 'Ужин' },
  { value: 'SNACK', label: 'Перекус' },
];

/** U31: значение строки состава — число|null для AmountInput (запятая/точка). */
const rowAmountValue = (raw: string): number | null => {
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && String(raw).trim() !== '' ? n : null;
};

export function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(',', '.').trim());
  if (!raw.trim() || Number.isNaN(n) || n <= 0) return null;
  return n;
}

let rowSeq = 1;

export default function RecipeEditorModal({ recipe, categories, onClose, onSaved }: Props) {
  const { showError, showSuccess } = useToast();

  const [products, setProducts] = useState<EditorProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [name, setName] = useState(recipe?.name ?? '');
  const [mealType, setMealType] = useState<MealType>(recipe?.mealType ?? 'LUNCH');
  const [category, setCategory] = useState(recipe?.category ?? '');
  const [cookMinutes, setCookMinutes] = useState<string>(
    recipe?.cookMinutes != null ? String(recipe.cookMinutes) : '0'
  );
  const [baseServings, setBaseServings] = useState<string>(
    recipe?.baseServings != null ? String(recipe.baseServings) : '1'
  );

  const [rows, setRows] = useState<Row[]>(() =>
    (recipe?.ingredients ?? []).map(ri => ({
      key: rowSeq++,
      ingredientId: ri.ingredientId,
      // Release-1.0: плоские DTO (снапшоты походов) несут ingredientName — читаем обе формы,
      // иначе строка редактора открывается с пустым названием.
      query: ri.ingredient?.name ?? (ri as { ingredientName?: string }).ingredientName ?? '',
      amount: String(ri.amount),
    }))
  );
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  // U15 (список багов 25.10): категория — свободный ввод со стилизованными
  // подсказками существующих категорий (нативный datalist выглядел чужеродно).
  const [catOpen, setCatOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get<unknown>('/admin/products', { params: { size: '1000' } });
        const list = Array.isArray(res) ? res : ((res as { content?: EditorProduct[] })?.content ?? []);
        if (alive) setProducts(list);
      } catch (err: unknown) {
        if (alive) showError(err instanceof Error ? err.message : 'Не удалось загрузить продукты');
      } finally {
        if (alive) setProductsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const productById = useMemo(() => {
    const m = new Map<string, EditorProduct>();
    products.forEach(p => m.set(String(p.id), p));
    return m;
  }, [products]);

  // Превью: ккал и вес на порцию (CR-1: из продуктов; PCS/PACK — через piece_weight_g)
  const preview = useMemo(() => {
    const servings = Number(baseServings.replace(',', '.')) || 1;
    let grams = 0;
    let kcal = 0;
    for (const row of rows) {
      if (!row.ingredientId) continue;
      const p = productById.get(String(row.ingredientId));
      const amount = parseAmount(row.amount);
      if (!p || amount == null) continue;
      const g = p.unit === 'PCS' || p.unit === 'PACK'
        ? amount * (p.pieceWeightG ?? 0)
        : amount * 1000;
      grams += g;
      kcal += (p.kcalPer100g ?? 0) * (g / 100);
    }
    return { kcalPerServing: Math.round(kcal / servings), gramsPerServing: Math.round(grams / servings) };
  }, [rows, baseServings, productById]);

  const suggestionsFor = (row: Row): EditorProduct[] => {
    if (row.ingredientId) return [];
    const q = row.query.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(rows.filter(r => r.ingredientId).map(r => r.ingredientId));
    return products
      .filter(p => p.name.toLowerCase().includes(q) && !taken.has(String(p.id)))
      .slice(0, 7);
  };

  /** U15: подсказки категорий — фильтр по введённой подстроке, без точного дубля. */
  const catSuggestions = useMemo(() => {
    const q = category.trim().toLowerCase();
    return categories
      .filter(c => c.toLowerCase() !== q && (!q || c.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [categories, category]);

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () => setRows(prev => [...prev, { key: rowSeq++, ingredientId: null, query: '', amount: '' }]);

  const removeRow = (key: number) => setRows(prev => prev.filter(r => r.key !== key));

  const handleSave = async () => {
    // Пустые строки (ничего не выбрано и нет количества) игнорируем, остальные валидируем строго
    const meaningful = rows.filter(r => r.ingredientId || r.query.trim() || r.amount.trim());
    const rowErrors: string[] = [];
    meaningful.forEach((r, i) => {
      if (!r.ingredientId) rowErrors.push(`Строка ${i + 1}: выберите продукт из списка`);
      if (parseAmount(r.amount) == null) rowErrors.push(`Строка ${i + 1}: укажите количество больше нуля`);
    });

    const servings = parseAmount(baseServings);
    const cook = cookMinutes.trim() === '' ? 0 : Number(cookMinutes.replace(',', '.'));
    const fieldErrors = validateRecipe({
      name,
      mealType,
      baseServings: servings ?? 0,
      ingredients: meaningful.filter(r => r.ingredientId && parseAmount(r.amount) != null),
    }).map(fe => `${fe.field}: ${fe.message}`);
    if (cookMinutes.trim() !== '' && (Number.isNaN(cook) || cook < 0)) {
      fieldErrors.push('cookMinutes: время готовки не может быть отрицательным');
    }

    const all = [...fieldErrors, ...rowErrors];
    if (all.length > 0) {
      setErrors(all);
      return;
    }
    setErrors([]);

    const payload = {
      name: name.trim(),
      mealType,
      category: category.trim() || undefined,
      cookMinutes: cook,
      baseServings: servings,
      ingredients: meaningful.map(r => ({
        ingredientId: r.ingredientId as string | number,
        amount: parseAmount(r.amount) as number,
      })),
    };

    try {
      setSaving(true);
      if (recipe) {
        await api.put(`/admin/recipes/${recipe.id}`, payload);
        showSuccess('Рецепт обновлён');
      } else {
        await api.post('/admin/recipes', payload);
        showSuccess('Рецепт создан');
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { error?: { detail?: string; title?: string } })?.error?.detail
        ?? (err as Error)?.message
        ?? 'Не удалось сохранить рецепт';
      showError(detail);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' };

  return (
    /* Список багов 25.10 (U3/U14): единый оверлей приложения — общий <Modal>
       (портал в body + .modal-overlay: затемнение+blur, всегда по центру вьюпорта).
       Прежний собственный `fixed bg-black/60` без портала центрировался по
       скролл-контейнеру страницы и «уезжал» за экран. */
    <Modal onClose={onClose}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="dialog"
        aria-modal="true"
        aria-label={recipe ? 'Редактирование блюда' : 'Новое блюдо'}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {recipe ? 'Редактирование блюда' : 'Новое блюдо'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Закрыть" className="px-2 py-1 rounded-lg">
            <X size={18} />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--muted)' }} htmlFor="recipe-name">
              Название
            </label>
            <input
              id="recipe-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Уха из рыбных консервов"
              className="w-full px-3 py-2.5 rounded-lg outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <span className="block text-sm mb-1" style={{ color: 'var(--muted)' }}>Тип приёма</span>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map(mt => (
                <Button
                  key={mt.value}
                  type="button"
                  variant={mealType === mt.value ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setMealType(mt.value)}
                >
                  {mt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--muted)' }} htmlFor="recipe-category">
                Категория
              </label>
              <div className="relative">
                <input
                  id="recipe-category"
                  type="text"
                  value={category}
                  onChange={e => { setCategory(e.target.value); setCatOpen(true); }}
                  onFocus={() => setCatOpen(true)}
                  onBlur={() => setTimeout(() => setCatOpen(false), 150)}
                  placeholder="Супы, Каши, Второе…"
                  aria-describedby="recipe-category-hint"
                  className="w-full px-3 py-2.5 rounded-lg outline-none"
                  style={inputStyle}
                />
                {catOpen && catSuggestions.length > 0 && (
                  <ul
                    className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden text-sm"
                    style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
                    role="listbox"
                    aria-label="Существующие категории"
                  >
                    {catSuggestions.map(c => (
                      <li key={c}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:opacity-80"
                          style={{ color: 'var(--text)' }}
                          onMouseDown={() => { setCategory(c); setCatOpen(false); }}
                        >
                          {c}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p id="recipe-category-hint" className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Свободный ввод: выберите существующую или впишите свою.
              </p>
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--muted)' }} htmlFor="recipe-cook">
                Готовка, мин (0 = без огня)
              </label>
              <input
                id="recipe-cook"
                type="number"
                min={0}
                value={cookMinutes}
                onChange={e => setCookMinutes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--muted)' }} htmlFor="recipe-servings">
                Порций в рецепте (base)
              </label>
              <input
                id="recipe-servings"
                type="number"
                min={1}
                value={baseServings}
                onChange={e => setBaseServings(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Состав (количество на {baseServings || 1} порц.)
              </span>
              <Button type="button" variant="primary" size="sm" onClick={addRow}>
                <Plus size={14} /> ингредиент
              </Button>
            </div>

            {productsLoading && (
              <p className="text-sm py-2" style={{ color: 'var(--muted)' }}>Загрузка продуктов…</p>
            )}

            <div className="space-y-2">
              {rows.map(row => {
                const product = row.ingredientId ? productById.get(String(row.ingredientId)) : undefined;
                const suggestions = openPicker === row.key ? suggestionsFor(row) : [];
                return (
                  <div key={row.key} className="relative grid grid-cols-[1fr_auto_36px] gap-2 items-center">
                    <div className="relative">
                      <input
                        type="text"
                        aria-label="Продукт"
                        value={product ? product.name : row.query}
                        onChange={e => updateRow(row.key, { query: e.target.value, ingredientId: null })}
                        onFocus={() => setOpenPicker(row.key)}
                        onBlur={() => setTimeout(() => setOpenPicker(null), 150)}
                        placeholder="Найти продукт…"
                        className="w-full px-3 py-2 rounded-lg outline-none text-sm"
                        style={inputStyle}
                      />
                      {suggestions.length > 0 && (
                        <ul
                          className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden text-sm"
                          style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
                        >
                          {suggestions.map(p => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 hover:opacity-80"
                                style={{ color: 'var(--text)' }}
                                onMouseDown={() => {
                                  updateRow(row.key, { ingredientId: String(p.id), query: p.name });
                                  setOpenPicker(null);
                                }}
                              >
                                {p.name}
                                <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                                  {p.kcalPer100g != null ? `${Math.round(p.kcalPer100g)} ккал/100${p.unit === 'L' ? 'мл' : 'г'}` : ''}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {/* U31 (список 26.10): количество в г/мл с переключателем «г↔кг» —
                        без «0,015 кг»; наружу по-прежнему базовые единицы (контракт T0) */}
                    <AmountInput
                      size="sm"
                      value={rowAmountValue(row.amount)}
                      unit={product?.unit ?? 'PCS'}
                      onChange={v => updateRow(row.key, { amount: String(v) })}
                      ariaLabel="Количество"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Удалить строку"
                      onClick={() => removeRow(row.key)}
                      className="px-2 py-2 rounded-lg flex items-center justify-center"
                      style={{ color: 'var(--muted)' }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                );
              })}
            </div>

            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
              ≈ {preview.kcalPerServing} ккал/порция · {preview.gramsPerServing} г/порция (расчёт из продуктов, CR-1)
            </p>
          </div>

          {errors.length > 0 && (
            <ul className="text-sm space-y-1 rounded-lg px-3 py-2" style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {saving ? 'Сохранение…' : recipe ? 'Сохранить изменения' : 'Создать блюдо'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
