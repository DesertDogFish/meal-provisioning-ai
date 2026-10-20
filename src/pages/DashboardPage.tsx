import { useApp } from '../store/AppContext';
import { useNavigate } from 'react-router-dom';
import { Mountain, Utensils, TrendingUp, Users, Calendar, DollarSign } from 'lucide-react';
import { calculateShoppingList, calculatePersonSummary } from '../utils/calculations';

export default function DashboardPage() {
  const { state } = useApp();
  const navigate = useNavigate();
  
  const myTrips = state.trips.filter(t => t.userId === state.currentUser?.id);
  const recipesMap = new Map(state.recipes.map(r => [r.id, r]));
  
  const stats = myTrips.map(trip => {
    const shopping = calculateShoppingList(trip, recipesMap, state.prices);
    const { tripSummary } = calculatePersonSummary(trip, recipesMap, state.prices);
    const totalDays = trip.days?.length || 0;
    const totalMeals = trip.days?.reduce((acc, d) => acc + (d.meals?.length || 0), 0) || 0;
    return { trip, shopping, tripSummary, totalDays, totalMeals };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Добро пожаловать, {state.currentUser?.firstName}!</h1>
        <p className="text-slate-500 mt-1">Обзор ваших походов и запасов</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Mountain size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{myTrips.length}</p>
              <p className="text-sm text-slate-500">Походов</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Utensils size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{state.recipes.length}</p>
              <p className="text-sm text-slate-500">Рецептов</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{state.ingredients.length}</p>
              <p className="text-sm text-slate-500">Компонентов</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <DollarSign size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {stats.reduce((acc, s) => acc + s.tripSummary.totalCost, 0).toLocaleString('ru-RU')} ₽
              </p>
              <p className="text-sm text-slate-500">Общая стоимость</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trips overview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">Ваши походы</h2>
          <button
            onClick={() => navigate('/trips')}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Все походы →
          </button>
        </div>

        {myTrips.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Mountain size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 mb-4">У вас пока нет походов</p>
            <button
              onClick={() => navigate('/trips')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Создать поход
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.map(({ trip, tripSummary, totalDays, totalMeals }) => (
              <div
                key={trip.id}
                onClick={() => navigate(`/trips/${trip.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-slate-900 text-lg">{trip.name}</h3>
                  {tripSummary.hasMissingPrices && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                      Нет цен
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-slate-900">{totalDays}</p>
                    <p className="text-xs text-slate-500">Дней</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-slate-900">{totalMeals}</p>
                    <p className="text-xs text-slate-500">Приёмов пищи</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-slate-900">{tripSummary.totalCost.toLocaleString('ru-RU')} ₽</p>
                    <p className="text-xs text-slate-500">Стоимость</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
