import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { calculateMenuByDays, calculateShoppingList, calculateDayShopping, calculatePersonSummary, formatAmount, getEffectivePeople } from '../utils/calculations';
import { ArrowLeft, Plus, Trash2, Users, Utensils, ShoppingCart, BookOpen, TrendingUp, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { MealType } from '../types';

const mealTypeLabels: Record<MealType, string> = {
  BREAKFAST: 'Завтрак',
  LUNCH: 'Обед',
  DINNER: 'Ужин',
  SNACK: 'Перекус',
};

const mealTypeColors: Record<MealType, string> = {
  BREAKFAST: 'bg-amber-100 text-amber-700',
  LUNCH: 'bg-emerald-100 text-emerald-700',
  DINNER: 'bg-blue-100 text-blue-700',
  SNACK: 'bg-purple-100 text-purple-700',
};

type TabType = 'menu' | 'shopping' | 'dayShopping' | 'person';

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('menu');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showAddMeal, setShowAddMeal] = useState<{ dayId: string } | null>(null);
  const [newMeal, setNewMeal] = useState({ mealType: 'LUNCH' as MealType, recipeId: '', peopleOverride: '' });
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [dayPeopleOverride, setDayPeopleOverride] = useState('');

  const trip = state.trips.find(t => t.id === id);
  if (!trip) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Поход не найден</p>
        <button onClick={() => navigate('/trips')} className="mt-4 text-emerald-600 hover:text-emerald-700">← Назад к походам</button>
      </div>
    );
  }

  const recipesMap = new Map(state.recipes.map(r => [r.id, r]));
  const approvedRecipes = state.recipes.filter(r => r.source === 'MANUAL' || r.source === 'API' || r.source === 'AI');

  const toggleDay = (dayId: string) => {
    const next = new Set(expandedDays);
    if (next.has(dayId)) next.delete(dayId);
    else next.add(dayId);
    setExpandedDays(next);
  };

  const handleAddMeal = () => {
    if (!showAddMeal || !newMeal.recipeId) return;
    const day = trip.days?.find(d => d.id === showAddMeal.dayId);
    if (!day) return;
    dispatch({
      type: 'ADD_MEAL',
      payload: {
        tripId: trip.id,
        dayId: showAddMeal.dayId,
        mealType: newMeal.mealType,
        recipeId: newMeal.recipeId,
        peopleOverride: newMeal.peopleOverride ? parseInt(newMeal.peopleOverride) : undefined,
        sortOrder: (day.meals?.length || 0) + 1,
      }
    });
    setShowAddMeal(null);
    setNewMeal({ mealType: 'LUNCH', recipeId: '', peopleOverride: '' });
  };

  const handleDeleteMeal = (dayId: string, mealId: string) => {
    dispatch({ type: 'DELETE_MEAL', payload: { tripId: trip.id, dayId, mealId } });
  };

  const handleUpdateDayPeople = (dayId: string) => {
    const val = dayPeopleOverride ? parseInt(dayPeopleOverride) : null;
    dispatch({ type: 'UPDATE_DAY', payload: { tripId: trip.id, dayId, peopleOverride: val ?? undefined } });
    setEditingDay(null);
    setDayPeopleOverride('');
  };

  // Calculations
  const menuByDays = calculateMenuByDays(trip, recipesMap);
  const shoppingList = calculateShoppingList(trip, recipesMap, state.prices);
  const dayShopping = calculateDayShopping(trip, recipesMap, state.prices);
  const { summary: personSummary, tripSummary } = calculatePersonSummary(trip, recipesMap, state.prices);

  const tabs = [
    { id: 'menu' as TabType, label: 'Меню по дням', icon: <BookOpen size={16} /> },
    { id: 'shopping' as TabType, label: 'Закупка на поход', icon: <ShoppingCart size={16} /> },
    { id: 'dayShopping' as TabType, label: 'Закупка по дням', icon: <Calendar size={16} /> },
    { id: 'person' as TabType, label: 'На человека', icon: <Users size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/trips')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{trip.name}</h1>
          <p className="text-sm text-slate-500">
            {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')} • {trip.defaultPeople} чел.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Дней</p>
          <p className="text-xl font-bold text-slate-900">{trip.days?.length || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Приёмов пищи</p>
          <p className="text-xl font-bold text-slate-900">{trip.days?.reduce((a, d) => a + (d.meals?.length || 0), 0) || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Стоимость</p>
          <p className="text-xl font-bold text-slate-900">{tripSummary.totalCost.toLocaleString('ru-RU')} ₽</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">На человека</p>
          <p className="text-xl font-bold text-slate-900">{tripSummary.costPerDefaultPerson.toLocaleString('ru-RU')} ₽</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'menu' && (
        <div className="space-y-3">
          {menuByDays.map((day, idx) => {
            const tripDay = trip.days?.[idx];
            if (!tripDay) return null;
            const isExpanded = expandedDays.has(tripDay.id);
            
            return (
              <div key={tripDay.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => toggleDay(tripDay.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                    <div>
                      <p className="font-semibold text-slate-900">
                        {new Date(day.dayDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-xs text-slate-500">{day.meals.length} приёмов пищи • {day.effectivePeople} чел.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tripDay.peopleOverride && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {tripDay.peopleOverride} чел.
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingDay(tripDay.id); setDayPeopleOverride(tripDay.peopleOverride?.toString() || ''); }}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                      title="Изменить количество людей"
                    >
                      <Users size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAddMeal({ dayId: tripDay.id }); setNewMeal({ mealType: 'LUNCH', recipeId: '', peopleOverride: '' }); }}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                      title="Добавить приём пищи"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* Edit day people */}
                {editingDay === tripDay.id && (
                  <div className="px-4 pb-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="text-sm text-slate-600">Людей на день:</span>
                    <input
                      type="number"
                      min={1}
                      value={dayPeopleOverride}
                      onChange={e => setDayPeopleOverride(e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
                      placeholder={trip.defaultPeople.toString()}
                    />
                    <button onClick={() => handleUpdateDayPeople(tripDay.id)} className="px-3 py-1 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700">OK</button>
                    <button onClick={() => setEditingDay(null)} className="px-3 py-1 text-slate-500 text-sm hover:text-slate-700">Отмена</button>
                  </div>
                )}

                {/* Meals */}
                {isExpanded && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {day.meals.map((meal, mealIdx) => {
                      const tripMeal = tripDay.meals?.[mealIdx];
                      return (
                      <div key={mealIdx} className="px-4 py-3 pl-12">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${mealTypeColors[meal.mealType]}`}>
                              {mealTypeLabels[meal.mealType]}
                            </span>
                            <span className="font-medium text-slate-900">{meal.recipeName}</span>
                            <span className="text-xs text-slate-400">({meal.servings} порц.)</span>
                          </div>
                          <button
                            onClick={() => tripMeal && handleDeleteMeal(tripDay.id, tripMeal.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {meal.ingredients.map((ing, i) => (
                            <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              {ing.name}: {formatAmount(ing.amount, ing.unit)}
                            </span>
                          ))}
                        </div>
                      </div>
                      );
                    })}
                    {day.meals.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">
                        Нет приёмов пищи. Нажмите + чтобы добавить.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'shopping' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-900">Список закупок на весь поход</h3>
            <p className="text-sm text-slate-500">Итого: {shoppingList.reduce((a, i) => a + (i.estimatedCost || 0), 0).toLocaleString('ru-RU')} ₽</p>
            {tripSummary.hasMissingPrices && (
              <p className="text-sm text-amber-600 mt-1">⚠️ Нет цен для: {tripSummary.missingIngredients.join(', ')}</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Продукт</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Количество</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Стоимость</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shoppingList.map(item => (
                  <tr key={item.ingredientId}>
                    <td className="px-4 py-3 text-slate-900">{item.ingredientName}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatAmount(item.totalAmount, item.unit)}</td>
                    <td className="px-4 py-3 text-right">
                      {item.hasPrice ? (
                        <span className="text-slate-900">{item.estimatedCost?.toLocaleString('ru-RU')} ₽</span>
                      ) : (
                        <span className="text-amber-600 text-xs">нет цены</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'dayShopping' && (
        <div className="space-y-3">
          {dayShopping.map(day => (
            <div key={day.dayDate} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">
                    {new Date(day.dayDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-xs text-slate-500">{day.items.length} продуктов</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{day.dayCost.toLocaleString('ru-RU')} ₽</p>
                  {day.hasMissingPrices && <p className="text-xs text-amber-600">есть без цены</p>}
                </div>
              </div>
              <div className="px-4 py-2">
                {day.items.map(item => (
                  <div key={item.ingredientId} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-slate-700">{item.ingredientName}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500">{formatAmount(item.totalAmount, item.unit)}</span>
                      <span className="text-slate-900 w-20 text-right">
                        {item.hasPrice ? `${item.estimatedCost?.toLocaleString('ru-RU')} ₽` : <span className="text-amber-600 text-xs">—</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'person' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-900 mb-3">Сводка</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">Человеко-приёмов</p>
                <p className="text-lg font-bold text-slate-900">{tripSummary.totalPersonMeals}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">На 1 чел. (общее)</p>
                <p className="text-lg font-bold text-slate-900">{tripSummary.costPerDefaultPerson.toLocaleString('ru-RU')} ₽</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">На 1 чел./приём</p>
                <p className="text-lg font-bold text-slate-900">{tripSummary.costPerPersonMeal.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ₽</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Калории/приём</p>
                <p className="text-lg font-bold text-slate-900">{tripSummary.caloriesPerPersonMeal ? `${Math.round(tripSummary.caloriesPerPersonMeal)} ккал` : '—'}</p>
              </div>
            </div>
          </div>

          {/* Per person products */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">Продукты на человека</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Продукт</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">На чел. (общее)</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">На чел./приём</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">₽/чел.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {personSummary.map((item, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-slate-900">{item.ingredientName}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatAmount(item.amountPerDefaultPerson, item.unit)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatAmount(item.amountPerPersonMeal, item.unit)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-900">
                        {item.costPerDefaultPerson ? `${item.costPerDefaultPerson.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ₽` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add meal modal */}
      {showAddMeal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Добавить приём пищи</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Тип приёма</label>
                <select
                  value={newMeal.mealType}
                  onChange={e => setNewMeal({ ...newMeal, mealType: e.target.value as MealType })}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="BREAKFAST">Завтрак</option>
                  <option value="LUNCH">Обед</option>
                  <option value="DINNER">Ужин</option>
                  <option value="SNACK">Перекус</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Блюдо</label>
                <select
                  value={newMeal.recipeId}
                  onChange={e => setNewMeal({ ...newMeal, recipeId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Выберите блюдо...</option>
                  {state.recipes.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({mealTypeLabels[r.mealType]})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Количество человек (опционально)</label>
                <input
                  type="number"
                  min={1}
                  value={newMeal.peopleOverride}
                  onChange={e => setNewMeal({ ...newMeal, peopleOverride: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder={`По умолчанию: ${trip.defaultPeople}`}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddMeal(null)} className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Отмена
              </button>
              <button onClick={handleAddMeal} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
