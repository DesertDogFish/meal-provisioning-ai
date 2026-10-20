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
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Каталог рецептов</h1>
        <p className="text-slate-500 mt-1">Блюда для планирования питания в походах</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск рецептов..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        <select
          value={filterMealType}
          onChange={e => setFilterMealType(e.target.value as MealType | '')}
          className="px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
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
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold text-slate-900">{recipe.name}</h3>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${mealTypeColors[recipe.mealType]}`}>
                {mealTypeLabels[recipe.mealType]}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
              <span>👥 {recipe.baseServings} порций</span>
              {recipe.caloriesPerServing && <span>🔥 {recipe.caloriesPerServing} ккал</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {recipe.ingredients.slice(0, 4).map(ri => (
                <span key={ri.ingredientId} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {ri.ingredient?.name || '?'}
                </span>
              ))}
              {recipe.ingredients.length > 4 && (
                <span className="text-xs text-slate-400 px-2 py-0.5">+{recipe.ingredients.length - 4}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Utensils size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">Рецепты не найдены</p>
        </div>
      )}

      {/* Recipe detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRecipe(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${mealTypeColors[selected.mealType]}`}>
                    {mealTypeLabels[selected.mealType]}
                  </span>
                  <span>{selected.baseServings} порций</span>
                  {selected.caloriesPerServing && <span>{selected.caloriesPerServing} ккал/порция</span>}
                </div>
              </div>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                {selected.source === 'MANUAL' ? 'Вручную' : selected.source === 'API' ? 'API' : 'AI'}
              </span>
            </div>

            <h3 className="font-semibold text-slate-900 mb-2">Ингредиенты:</h3>
            <div className="space-y-2">
              {selected.ingredients.map(ri => (
                <div key={ri.ingredientId} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-900">{ri.ingredient?.name || 'Неизвестный'}</span>
                  <span className="text-sm text-slate-600">{formatAmount(ri.amount, ri.ingredient?.unit || 'PCS')}</span>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => setSelectedRecipe(null)}
              className="w-full mt-6 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
