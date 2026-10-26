import { useState, useMemo, useEffect, useCallback } from 'react';
import { Pencil, Plus, Search, Trash2, Utensils, X } from 'lucide-react';
import { MealType } from '../types';
import { formatAmount } from '../utils/calculations';
import { humanizeCategory, servingsWord, ingredientsWord } from '../utils/text';
import { api, getRecipes } from '../api/client';
import { useToast } from '../components/ToastProvider';
import Modal from '../components/Modal';
import RecipeEditorModal from '../components/RecipeEditorModal';
import { Button } from '../components/Button';

interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
  category?: string;
  cookMinutes?: number;
  baseServings: number;
  caloriesPerServing?: number;
  source?: string;
  ingredients: any[];
}

const mealTypeLabels: Record<MealType, string> = {
  BREAKFAST: 'Завтрак',
  LUNCH: 'Обед',
  DINNER: 'Ужин',
  SNACK: 'Перекус',
};

export default function RecipesPage() {
  const { showError, showSuccess } = useToast();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMealType, setFilterMealType] = useState<MealType | ''>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [noFireOnly, setNoFireOnly] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  // Роль нужна для админ-действий каталога (создание/правка/удаление блюд).
  // Ошибка /auth/me означает «не админ», а не поломку страницы.
  useEffect(() => {
    api.get<{ role?: string }>('/auth/me')
      .then(u => setIsAdmin((u?.role ?? '').toUpperCase() === 'ADMIN'))
      .catch(() => setIsAdmin(false));
  }, []);

  const openCreate = () => {
    setEditingRecipe(null);
    setEditorOpen(true);
  };

  const openEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setSelectedRecipe(null);
    setEditorOpen(true);
  };

  const handleDelete = async (recipe: Recipe) => {
    // U16 (список багов 25.10): блюда — сущность верхнего уровня. Походы с V20
    // живут на снапшотах рецептов, поэтому клиентская блокировка «используется
    // в походах» устарела: удаление спрашивает только подтверждение, а сервер
    // гарантирует изоляцию походов (доснепшотит висящие ссылки при удалении).
    if (!window.confirm(`Удалить рецепт «${recipe.name}»? Действие необратимо.`)) return;
    try {
      await api.del(`/admin/recipes/${recipe.id}`);
      showSuccess('Рецепт удалён');
      setSelectedRecipe(null);
      await loadRecipes();
    } catch (err: any) {
      showError(err?.detail || err?.message || 'Не удалось удалить рецепт');
    }
  };

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRecipes();
      setRecipes(data);
    } catch (err: any) {
      console.error('Failed to load recipes:', err);
      // ЗАДАЧА 3: тост + сброс устаревшего каталога
      setRecipes([]);
      setError('Не удалось загрузить рецепты');
      showError(err?.detail || 'Не удалось загрузить рецепты');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // Получить уникальные категории
  const categories = useMemo(() => {
    const cats = new Set(recipes.map(r => r.category).filter((c): c is string => Boolean(c)));
    return Array.from(cats).sort();
  }, [recipes]);

  // Фильтрация
  const filtered = useMemo(() => {
    return recipes.filter(r => {
      // Поиск по названию или ингредиентам
      if (search) {
        const searchLower = search.toLowerCase();
        const nameMatch = r.name.toLowerCase().includes(searchLower);
        const ingredientMatch = r.ingredients.some(ri => 
          ri.ingredient?.name.toLowerCase().includes(searchLower)
        );
        if (!nameMatch && !ingredientMatch) return false;
      }
      
      // Фильтр по типу приёма
      if (filterMealType && r.mealType !== filterMealType) return false;
      
      // Фильтр по категории
      if (filterCategory && r.category !== filterCategory) return false;
      
      // Только без огня
      if (noFireOnly && r.cookMinutes !== 0) return false;
      
      return true;
    });
  }, [recipes, search, filterMealType, filterCategory, noFireOnly]);

  // Подсчёт для чипов
  const counts = useMemo(() => {
    const all = recipes.length;
    const breakfast = recipes.filter(r => r.mealType === 'BREAKFAST').length;
    const lunch = recipes.filter(r => r.mealType === 'LUNCH').length;
    const dinner = recipes.filter(r => r.mealType === 'DINNER').length;
    const snack = recipes.filter(r => r.mealType === 'SNACK').length;
    const noFire = recipes.filter(r => r.cookMinutes === 0).length;
    return { all, breakfast, lunch, dinner, snack, noFire };
  }, [recipes]);

  const resetFilters = () => {
    setSearch('');
    setFilterMealType('');
    setFilterCategory('');
    setNoFireOnly(false);
  };

  const selected = recipes.find(r => r.id === selectedRecipe);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Каталог блюд</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Каталог блюд</h1>
          <p className="mt-1" style={{ color: 'var(--fire)' }}>{error}</p>
          <Button variant="ghost" onClick={loadRecipes}>Повторить</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>
          Каталог блюд · {recipes.length} позиций
        </h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Завтрак {counts.breakfast} · Обед {counts.lunch} · Ужин {counts.dinner} · Перекус {counts.snack} | без огня {counts.noFire}
        </p>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={openCreate} aria-label="Создать блюдо">
                      <Plus size={16} /> Создать блюдо
                    </Button>
        )}
      </div>

      {/* Фильтры */}
      <div className="sticky top-0 z-10 py-3 space-y-3" style={{ 
        background: 'linear-gradient(var(--bg) 75%, transparent)' 
      }}>
        {/* Первая строка: поиск и чипы типов */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию или ингредиенту..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
              style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
          
          {/* U2 (список багов 25.10): активный фильтр — primary («рыжий» полный),
              неактивные — soft (приглушённые) + aria-pressed: сразу видно,
              какой фильтр применён. */}
          {([
            { value: '' as MealType | '', label: 'Все', count: counts.all, aria: 'Показать все рецепты' },
            { value: 'BREAKFAST' as MealType, label: 'Завтрак', count: counts.breakfast, aria: 'Фильтр: Завтрак' },
            { value: 'LUNCH' as MealType, label: 'Обед', count: counts.lunch, aria: 'Фильтр: Обед' },
            { value: 'DINNER' as MealType, label: 'Ужин', count: counts.dinner, aria: 'Фильтр: Ужин' },
            { value: 'SNACK' as MealType, label: 'Перекус', count: counts.snack, aria: 'Фильтр: Перекус' },
          ]).map(chip => (
            <Button
              key={chip.value || 'all'}
              variant={filterMealType === chip.value ? 'primary' : 'soft'}
              size="sm"
              aria-pressed={filterMealType === chip.value}
              onClick={() => setFilterMealType(chip.value)}
              aria-label={chip.aria}
            >
              {chip.label} {chip.count}
            </Button>
          ))}
        </div>

        {/* Вторая строка: категория, без огня, сброс */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-4 py-2.5 rounded-lg outline-none"
            style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">Все категории</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          
          <button
            onClick={() => setNoFireOnly(!noFireOnly)}
            className="px-4 py-2.5 rounded-full text-xs font-bold transition-all"
            style={{
              background: noFireOnly ? 'color-mix(in srgb, var(--amber-500) 16%, transparent)' : 'transparent',
              border: noFireOnly ? '1px solid var(--fire)' : '1px solid var(--border)',
              color: noFireOnly ? 'var(--fire)' : 'var(--muted)'
            }}
          >
            🔥 Только без огня
          </button>
          
          {(search || filterMealType || filterCategory || noFireOnly) && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-2 rounded-full text-xs"
              style={{ color: 'var(--muted)' }}
            >
              <X size={14} />
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>

      {/* Сетка карточек */}
      {filtered.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.slice(0, visibleCount).map(recipe => (
              <div
                key={recipe.id}
                onClick={() => setSelectedRecipe(recipe.id)}
                className="rounded-xl p-4 lift cursor-pointer flex flex-col"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <h3 className="font-bold mb-2" style={{ color: 'var(--text)' }}>{recipe.name}</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {recipe.category && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full capitalize" style={{ background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }}>
                      {humanizeCategory(recipe.category)}
                    </span>
                  )}
                  {recipe.cookMinutes === 0 ? (
                    <span className="px-2 py-0.5 text-xs font-bold rounded-full" style={{ background: 'color-mix(in srgb, var(--amber-500) 16%, transparent)', color: 'var(--amber-300)' }}>
                      без огня
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                      {recipe.cookMinutes} мин
                    </span>
                  )}
                  {recipe.caloriesPerServing && (
                    <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                      {Math.round(recipe.caloriesPerServing)} ккал
                    </span>
                  )}
                </div>
                <div className="mt-auto pt-3 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                  {/* U20 (список багов 25.10): состав виден прямо на карточке —
                      первые два названия + «+N», полный список в title. */}
                  {(() => {
                    const names = (recipe.ingredients ?? [])
                      .map((ri: any) => ri.ingredient?.name ?? ri.ingredientName)
                      .filter((n: unknown): n is string => Boolean(n));
                    const shown = names.slice(0, 2).join(', ');
                    const rest = Math.max(0, names.length - 2);
                    return (
                      <span
                        className="text-xs truncate"
                        style={{ color: 'var(--muted)', maxWidth: '62%' }}
                        title={`${recipe.ingredients.length} ${ingredientsWord(recipe.ingredients.length)}: ${names.join(', ')}`}
                      >
                        {recipe.ingredients.length} {ingredientsWord(recipe.ingredients.length)}
                        {shown && <> · {shown}{rest > 0 && ` +${rest}`}</>}
                      </span>
                    );
                  })()}
                  <span className="flex items-center gap-1">
                    {isAdmin && (
                      <>
                        <button
                          aria-label={`Редактировать ${recipe.name}`}
                          title="Редактировать"
                          onClick={e => { e.stopPropagation(); openEdit(recipe); }}
                          className="px-2 py-2 rounded-lg"
                          style={{ color: 'var(--muted)' }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          aria-label={`Удалить ${recipe.name}`}
                          title="Удалить"
                          onClick={e => { e.stopPropagation(); handleDelete(recipe); }}
                          className="px-2 py-2 rounded-lg"
                          style={{ color: 'var(--fire)' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                    <button
                      className="px-4 py-2 rounded-full text-xs font-bold"
                      style={{ background: 'var(--grad-brand)', color: 'var(--on-fire)' }}
                    >
                      В меню
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {visibleCount < filtered.length && (
            <button
              onClick={() => setVisibleCount(prev => prev + 24)}
              className="w-full py-3 rounded-full font-semibold"
              style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              Показать ещё {Math.min(24, filtered.length - visibleCount)}
            </button>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <Utensils size={48} className="mx-auto mb-4" style={{ color: 'var(--muted)' }} />
          <p className="mb-4" style={{ color: 'var(--muted)' }}>Рецепты не найдены</p>
          <Button variant="ghost" onClick={resetFilters} aria-label="Сбросить фильтры">Сбросить фильтры</Button>
        </div>
      )}

      {/* Модалка деталей рецепта. U13/U21 (список багов 25.10): единая шапка —
          название, бейджи и действия (править/удалить/крестик) в одном месте;
          «огромная кнопка Закрыть» внизу убрана, крестик — как во всех модалках.
          U4: «1 порция» не переносится на две строки (whitespace-nowrap). */}
      {selected && (
        <Modal onClose={() => setSelectedRecipe(null)}>
          <div className="rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} role="dialog" aria-modal="true" aria-label={`Блюдо: ${selected.name}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{selected.name}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap" style={{ background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }}>
                    {mealTypeLabels[selected.mealType]}
                  </span>
                  {selected.category && <span className="recipe-category-badge whitespace-nowrap">{humanizeCategory(selected.category)}</span>}
                  <span className="whitespace-nowrap">{selected.baseServings} {servingsWord(selected.baseServings)}</span>
                  {selected.caloriesPerServing && <span className="whitespace-nowrap">{Math.round(selected.caloriesPerServing)} ккал/{servingsWord(1)} · рассчитано из продуктов</span>}
                  <span className="px-2 py-0.5 text-xs rounded-full whitespace-nowrap" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                    {selected.source === 'MANUAL' ? 'Вручную' : selected.source === 'API' ? 'API' : 'AI'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isAdmin && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(selected)} aria-label="Редактировать рецепт" title="Редактировать">
                      <Pencil size={16} />
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(selected)} aria-label="Удалить рецепт" title="Удалить">
                      <Trash2 size={16} />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSelectedRecipe(null)} aria-label="Закрыть" title="Закрыть">
                  <X size={18} />
                </Button>
              </div>
            </div>

            <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Ингредиенты:</h3>
            <div className="space-y-2">
              {selected.ingredients.map(ri => (
                <div key={ri.ingredientId} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--elev)' }}>
                  <span style={{ color: 'var(--text)' }}>{ri.ingredient?.name || 'Неизвестный'}</span>
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{formatAmount(ri.amount, ri.ingredient?.unit || 'PCS')}</span>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {editorOpen && (
        <RecipeEditorModal
          recipe={editingRecipe}
          categories={categories}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { loadRecipes(); }}
        />
      )}
    </div>
  );
}
