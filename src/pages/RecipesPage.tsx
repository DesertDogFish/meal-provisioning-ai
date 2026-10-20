import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Search, Filter, Utensils } from 'lucide-react';
import { MealType } from '../types';
import { formatAmount } from '../utils/calculations';

const mealTypeLabels: Record<MealType, string> = {
  BREAKFAST: 'Завтрак',
  LUNCH: 'Обед',
  DINNER: 'Ужин',
  SNACK: 'Перекус',
};

const mealTypeColors: Record<MealType, string> = {
  BREAKFAST: 'bg-amber-100 text-amber-700 border-amber-200',
  LUNCH: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  DINNER: 'bg-blue-100 text-blue-700 border-blue-200',
  SNACK: 'bg-purple-100 text-purple-700 border-purple-200',
};

export default function RecipesPage() {
  const { state } = useApp();
  const [search, setSearch] = useState('');
  const [filterMealType, setFilterMealType] = useState<MealType | ''>('');
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);

  const filtered = state.recipes.filter(r => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterMealType && r.mealType !== filterMealType) return false;
    return true;
  });

  const selected = state.recipes.find(r => r.id === selectedRecipe);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Каталог рецептов</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>Блюда для планирования питания в походах</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск рецептов..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
            style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        <select
          value={filterMealType}
          onChange={e => setFilterMealType(e.target.value as MealType | '')}
          className="px-4 py-2.5 rounded-lg outline-none"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Все типы</option>
          <option value="BREAKFAST">Завтрак</option>
          <option value="LUNCH">Обед</option>
          <option value="DINNER">Ужин</option>
          <option value="SNACK">Перекус</option>
        </select>
      </div>

      {/* Recipe grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(recipe => (
          <div
            key={recipe.id}
            onClick={() => setSelectedRecipe(recipe.id)}
            className="rounded-xl p-5 transition-all hover:scale-[1.02] cursor-pointer"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold" style={{ color: 'var(--text)' }}>{recipe.name}</h3>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' }}>
                {mealTypeLabels[recipe.mealType]}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm mb-3" style={{ color: 'var(--muted)' }}>
              <span>👥 {recipe.baseServings} порций</span>
              {recipe.caloriesPerServing && <span>🔥 {recipe.caloriesPerServing} ккал</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {recipe.ingredients.slice(0, 4).map(ri => (
                <span key={ri.ingredientId} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                  {ri.ingredient?.name || '?'}
                </span>
              ))}
              {recipe.ingredients.length > 4 && (
                <span className="text-xs px-2 py-0.5" style={{ color: 'var(--muted)' }}>+{recipe.ingredients.length - 4}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Utensils size={48} className="mx-auto mb-4" style={{ color: 'var(--muted)' }} />
          <p style={{ color: 'var(--muted)' }}>Рецепты не найдены</p>
        </div>
      )}

      {/* Recipe detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRecipe(null)}>
          <div className="rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{selected.name}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' }}>
                    {mealTypeLabels[selected.mealType]}
                  </span>
                  <span>{selected.baseServings} порций</span>
                  {selected.caloriesPerServing && <span>{selected.caloriesPerServing} ккал/порция</span>}
                </div>
              </div>
              <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                {selected.source === 'MANUAL' ? 'Вручную' : selected.source === 'API' ? 'API' : 'AI'}
              </span>
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
            
            <button
              onClick={() => setSelectedRecipe(null)}
              className="w-full mt-6 px-4 py-2.5 rounded-full"
              style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
