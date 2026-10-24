import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from './ToastProvider';
import { validateRecipe } from '../utils/validation';
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

const UNIT_SHORT: Record<UnitOfMeasure, string> = { KG: 'кг', L: 'л', PCS: 'шт', PACK: 'уп' };

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
      query: ri.ingredient?.name ?? '',
      amount: String(ri.amount),
    }))
  );
  const [openPicker, setOpenPicker] = useState<number | null>(null);
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={recipe ? 'Редактирование блюда' : 'Новое блюдо'}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {recipe ? 'Редактирование блюда' : 'Новое блюдо'}
          </h2>
          <button onClick={onClose} aria-label="Закрыть" className="ghost-btn px-2 py-1 rounded-lg">
            <X size={18} />
          </button>
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
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => setMealType(mt.value)}
                  className="px-4 py-2 rounded-full text-sm font-bold transition-all"
                  style={{
                    background: mealType === mt.value ? 'var(--grad-brand)' : 'transparent',
                    border: mealType === mt.value ? '1px solid transparent' : '1px solid var(--border)',
                    color: mealType === mt.value ? '#04121A' : 'var(--muted)',
                  }}
                >
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--muted)' }} htmlFor="recipe-category">
                Категория
              </label>
              <input
                id="recipe-category"
                type="text"
                list="recipe-categories"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="Супы, Каши, Второе…"
                className="w-full px-3 py-2.5 rounded-lg outline-none"
                style={inputStyle}
              />
              <datalist id="recipe-categories">
                {categories.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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
              <button type="button" onClick={addRow} className="ghost-btn px-3 py-1.5 rounded-full text-sm flex items-center gap-1">
                <Plus size={14} /> ингредиент
              </button>
            </div>

            {productsLoading && (
              <p className="text-sm py-2" style={{ color: 'var(--muted)' }}>Загрузка продуктов…</p>
            )}

            <div className="space-y-2">
              {rows.map(row => {
                const product = row.ingredientId ? productById.get(String(row.ingredientId)) : undefined;
                const suggestions = openPicker === row.key ? suggestionsFor(row) : [];
                return (
                  <div key={row.key} className="relative grid grid-cols-[1fr_110px_56px_36px] gap-2 items-center">
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
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Количество"
                      value={row.amount}
                      onChange={e => updateRow(row.key, { amount: e.target.value })}
                      placeholder="кол-во"
                      className="px-2 py-2 rounded-lg outline-none text-sm text-right"
                      style={inputStyle}
                    />
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>
                      {product ? UNIT_SHORT[product.unit] : '—'}
                    </span>
                    <button
                      type="button"
                      aria-label="Удалить строку"
                      onClick={() => removeRow(row.key)}
                      className="ghost-btn px-2 py-2 rounded-lg flex items-center justify-center"
                      style={{ color: 'var(--muted)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
              ≈ {preview.kcalPerServing} ккал/порция · {preview.gramsPerServing} г/порция (расчёт из продуктов, CR-1)
            </p>
          </div>

          {errors.length > 0 && (
            <ul className="text-sm space-y-1 rounded-lg px-3 py-2" style={{ background: 'rgba(232, 93, 31, 0.12)', color: 'var(--fire)' }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
            Отмена
          </button>
          <button onClick={handleSave} disabled={saving} className="grad-btn px-5 py-2.5 rounded-full font-bold">
            {saving ? 'Сохранение…' : recipe ? 'Сохранить изменения' : 'Создать блюдо'}
          </button>
        </div>
      </div>
    </div>
  );
}
