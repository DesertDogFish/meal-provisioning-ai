import { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';
import { Download } from 'lucide-react';
import { formatAmount } from '../utils/calculations';
import { NumberField } from './NumberField';
import { api, getRecipes } from '../api/client';

interface ShoppingItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalAmount: number;
  plannedUnitPrice?: number;
  actualUnitPrice?: number | null;
  plannedCost?: number;
  actualCost?: number;
  overridden: boolean;
  hasPlannedPrice: boolean;
}

interface DayShopping {
  dayDate: string;
  plannedCost: number;
  actualCost: number;
}

interface Props {
  tripId: string;
}

type TabType = 'total' | 'days' | 'person';

interface Trip {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  notes?: string;
  days?: TripDay[];
}

interface TripDay {
  id: string;
  tripId: string;
  dayDate: string;
  peopleOverride?: number;
  meals?: TripMeal[];
}

interface TripMeal {
  id: string;
  tripDayId: string;
  mealType: string;
  recipeId: string;
  recipe?: any;
  peopleOverride?: number;
  sortOrder: number;
}

interface Recipe {
  id: string;
  name: string;
  mealType: string;
  baseServings: number;
  caloriesPerServing?: number;
  ingredients: any[];
}

interface Price {
  id: string;
  ingredientId: string;
  pricePerUnit: number;
  currency: string;
  effectiveFrom: string;
}

export default function PriceOverridesTab({ tripId }: Props) {
  const { showError, showSuccess } = useToast();
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [dayShopping, setDayShopping] = useState<DayShopping[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('total');
  const [showModal, setShowModal] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Загрузка данных через API
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [tripData, recipesData, pricesData] = await Promise.all([
        api.get<Trip>(`/trips/${tripId}`),
        getRecipes(),
        // P0-3: чтение цен — общий эндпоинт для всех ролей (см. UserPriceController)
        api.get<Price[]>('/prices')
      ]);
      
      setTrip(tripData);
      
      // Расчёт списка закупок
      calculateShoppingData(tripData, recipesData, pricesData);
    } catch (err) {
      console.error('Failed to load ', err);
      setError('Не удалось загрузить данные');
      showError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const calculateShoppingData = (tripData: Trip, recipesData: Recipe[], pricesData: Price[]) => {
    // Расчёт списка закупок
    const recipesMap = new Map(recipesData.map(r => [r.id, r]));
    
    // Простой расчёт закупок (без использования calculateShoppingList из utils)
    const items: ShoppingItem[] = [];
    const ingredientTotals = new Map<string, { amount: number; ingredient: any }>();
    
    if (tripData.days) {
      for (const day of tripData.days) {
        if (day.meals) {
          for (const meal of day.meals) {
            const recipe = recipesMap.get(meal.recipeId);
            if (!recipe) continue;
            
            const people = meal.peopleOverride || day.peopleOverride || tripData.defaultPeople;
            
            for (const ri of recipe.ingredients) {
              const amount = (ri.amount / recipe.baseServings) * people;
              const existing = ingredientTotals.get(ri.ingredientId);
              
              if (existing) {
                existing.amount += amount;
              } else {
                ingredientTotals.set(ri.ingredientId, { amount, ingredient: ri.ingredient });
              }
            }
          }
        }
      }
    }
    
    // Преобразование в ShoppingItem
    for (const [ingredientId, data] of ingredientTotals.entries()) {
      const price = pricesData.find(p => p.ingredientId === ingredientId);
      const unitPrice = price?.pricePerUnit;
      
      items.push({
        ingredientId,
        ingredientName: data.ingredient?.name || 'Unknown',
        unit: data.ingredient?.unit || 'PCS',
        totalAmount: data.amount,
        plannedUnitPrice: unitPrice,
        actualUnitPrice: unitPrice,
        plannedCost: unitPrice ? data.amount * unitPrice : undefined,
        actualCost: unitPrice ? data.amount * unitPrice : undefined,
        overridden: false,
        hasPlannedPrice: !!unitPrice
      });
    }
    
    setShoppingItems(items);
    
    // Расчёт закупок по дням
    const dayShoppingData: DayShopping[] = [];
    if (tripData.days) {
      for (const day of tripData.days) {
        let dayCost = 0;
        
        if (day.meals) {
          for (const meal of day.meals) {
            const recipe = recipesMap.get(meal.recipeId);
            if (!recipe) continue;
            
            const people = meal.peopleOverride || day.peopleOverride || tripData.defaultPeople;
            
            for (const ri of recipe.ingredients) {
              const amount = (ri.amount / recipe.baseServings) * people;
              const price = pricesData.find(p => p.ingredientId === ri.ingredientId);
              if (price) {
                dayCost += amount * price.pricePerUnit;
              }
            }
          }
        }
        
        dayShoppingData.push({
          dayDate: day.dayDate,
          plannedCost: dayCost,
          actualCost: dayCost
        });
      }
    }
    
    setDayShopping(dayShoppingData);
  };

  // В mock-режиме оверрайды не поддерживаются
  // В реальном приложении здесь будет API вызов

  const calculateDelta = (planned?: number | null, actual?: number | null): number => {
    if (!planned || !actual || planned === 0) return 0;
    return ((actual - planned) / planned) * 100;
  };

  const formatDelta = (delta: number): string => {
    if (delta === 0) return '0%';
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
  };

  const getDeltaChipClass = (delta: number): string => {
    if (Math.abs(delta) < 0.001) return 'dim';
    return delta > 0 ? 'fire' : 'ok';
  };

  const totalPlanned = shoppingItems.reduce((sum, item) => sum + (item.plannedCost || 0), 0);
  const totalActual = shoppingItems.reduce((sum, item) => sum + (item.actualCost || 0), 0);
  const totalDelta = calculateDelta(totalPlanned, totalActual);

  const filteredItems = onlyDiff 
    ? shoppingItems.filter(item => item.overridden && item.actualUnitPrice !== item.plannedUnitPrice)
    : shoppingItems;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="note-box">Загрузка...</div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="space-y-4">
        <div className="note-box" style={{ color: 'var(--fire)' }}>
          {error || 'Поход не найден'}
        </div>
        <button onClick={loadData} className="ghost-btn">Повторить</button>
      </div>
    );
  }

  const defaultPeople = trip.defaultPeople || 1;
  const totalPersonMeals = trip.days?.reduce((acc: number, d: TripDay) => 
    acc + (d.meals?.reduce((mealAcc: number, m: TripMeal) => mealAcc + (m.peopleOverride || d.peopleOverride || trip.defaultPeople || 1), 0) || 0)
  , 0) || 1;

  return (
    <div className="space-y-4">
      {/* Информационная заметка */}
      <div className="note-box">
        ℹ Факт действует на все дни похода и не меняет справочник. Пустое поле = «план». 
        Шаг степпера адаптивный: сотни → ±10, тысячи → ±100, десятки → ±1.
      </div>

      {/* Панель действий */}
      <div className="flex gap-3 items-center flex-wrap">
        <button 
          onClick={() => setShowModal(true)}
          className="grad-btn"
        >
          Ввести чек
        </button>
        <button className="ghost-btn flex items-center gap-2">
          <Download size={16} />
          Экспорт PDF
        </button>
        <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--muted)', fontSize: '12px' }}>
          <input 
            type="checkbox" 
            checked={onlyDiff}
            onChange={e => setOnlyDiff(e.target.checked)}
          />
          только расхождения
        </label>
      </div>

      {/* Табы */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('total')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'total' 
              ? 'text-white' 
              : ''
          }`}
          style={{
            background: activeTab === 'total' ? 'var(--elev)' : 'transparent',
            border: activeTab === 'total' ? '1px solid transparent' : '1px solid var(--border)',
            color: activeTab === 'total' ? 'var(--text)' : 'var(--muted)',
            backgroundImage: activeTab === 'total' ? 'linear-gradient(var(--elev), var(--elev)) padding-box, linear-gradient(90deg, var(--w1), var(--w2)) border-box' : 'none'
          }}
        >
          Закупка
        </button>
        <button
          onClick={() => setActiveTab('days')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'days' 
              ? 'text-white' 
              : ''
          }`}
          style={{
            background: activeTab === 'days' ? 'var(--elev)' : 'transparent',
            border: activeTab === 'days' ? '1px solid transparent' : '1px solid var(--border)',
            color: activeTab === 'days' ? 'var(--text)' : 'var(--muted)',
            backgroundImage: activeTab === 'days' ? 'linear-gradient(var(--elev), var(--elev)) padding-box, linear-gradient(90deg, var(--w1), var(--w2)) border-box' : 'none'
          }}
        >
          По дням
        </button>
        <button
          onClick={() => setActiveTab('person')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'person' 
              ? 'text-white' 
              : ''
          }`}
          style={{
            background: activeTab === 'person' ? 'var(--elev)' : 'transparent',
            border: activeTab === 'person' ? '1px solid transparent' : '1px solid var(--border)',
            color: activeTab === 'person' ? 'var(--text)' : 'var(--muted)',
            backgroundImage: activeTab === 'person' ? 'linear-gradient(var(--elev), var(--elev)) padding-box, linear-gradient(90deg, var(--w1), var(--w2)) border-box' : 'none'
          }}
        >
          На человека
        </button>
      </div>

      {/* Вкладка: Закупка */}
      {activeTab === 'total' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 10px 14px' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Продукт</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Кол-во</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>План ₽/ед</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>План ₽</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Факт ₽/ед</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Факт ₽</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Δ</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const delta = calculateDelta(item.plannedUnitPrice, item.actualUnitPrice);
                const deltaChipClass = getDeltaChipClass(delta);

                return (
                  <tr key={item.ingredientId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-2 py-3">
                      <b style={{ color: 'var(--text)' }}>{item.ingredientName}</b>
                    </td>
                    <td className="px-2 py-3 text-right" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatAmount(item.totalAmount, item.unit)}
                    </td>
                    <td className="px-2 py-3 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {item.hasPlannedPrice ? item.plannedUnitPrice?.toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-3 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {item.plannedCost?.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) || '—'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <NumberField
                        value={item.actualUnitPrice ?? null}
                        stepRef={item.plannedUnitPrice}
                        onCommit={v => {
                          setShoppingItems(prev => prev.map(i => 
                            i.ingredientId === item.ingredientId 
                              ? { ...i, actualUnitPrice: v ?? undefined }
                              : i
                          ) as ShoppingItem[]);
                        }}
                        testId={`actual-input-${item.ingredientId}`}
                        ariaLabel={`Фактическая цена: ${item.ingredientName}`}
                      />
                    </td>
                    <td className="px-2 py-3 text-right" style={{ color: 'var(--w1)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                      {item.actualCost?.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) || '—'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <span className={`chip-delta ${deltaChipClass}`}>
                        {formatDelta(delta)}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">
                      {/* В mock-режиме оверрайды не поддерживаются */}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Sticky итог */}
          <div className="sticky-totals">
            <span style={{ color: 'var(--text)' }}>
              Итого план: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{totalPlanned.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</b>
            </span>
            <span style={{ color: 'var(--text)' }}>
              Итого факт: <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--w1)' }}>{totalActual.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</b>
            </span>
            <span className={`chip-delta ${getDeltaChipClass(totalDelta)}`}>
              {formatDelta(totalDelta)}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
              расхождение: {(totalActual - totalPlanned).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
            </span>
          </div>
        </div>
      )}

      {/* Вкладка: По дням */}
      {activeTab === 'days' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>День</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>План ₽</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Факт ₽</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {dayShopping.map(day => {
                const delta = calculateDelta(day.plannedCost, day.actualCost);
                return (
                  <tr key={day.dayDate} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3">
                      <b style={{ color: 'var(--text)' }}>
                        {new Date(day.dayDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                      </b>
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {day.plannedCost.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                      {day.actualCost.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`chip-delta ${getDeltaChipClass(delta)}`}>
                        {formatDelta(delta)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Вкладка: На человека */}
      {activeTab === 'person' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <b style={{ color: 'var(--text)' }}>На одного человека</b>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
              делим на defaultPeople = {defaultPeople}
            </p>
            <div className="flex justify-between py-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>План</span>
              <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {(totalPlanned / defaultPeople).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
              </b>
            </div>
            <div className="flex justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Факт</span>
              <b style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                {(totalActual / defaultPeople).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
              </b>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <b style={{ color: 'var(--text)' }}>На один человеко-приём</b>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
              делим на {totalPersonMeals} приёмов
            </p>
            <div className="flex justify-between py-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>План</span>
              <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {(totalPlanned / totalPersonMeals).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
              </b>
            </div>
            <div className="flex justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Факт</span>
              <b style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                {(totalActual / totalPersonMeals).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
              </b>
            </div>
          </div>
        </div>
      )}

      {/* Модалка "Ввести чек" */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <b style={{ fontFamily: 'Unbounded', fontSize: '15px', color: 'var(--text)' }}>Ввести чек</b>
            <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '6px 0 14px' }}>
              Фактические цены за единицу. Пусто = «= план».
            </p>
            <div className="flex flex-col gap-3">
              {shoppingItems.map(item => (
                <div key={item.ingredientId} className="flex gap-3 items-center">
                  <span style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>
                    {item.ingredientName}
                    <span style={{ color: 'var(--muted)' }}> · {formatAmount(item.totalAmount, item.unit)}</span>
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                    план {item.plannedUnitPrice?.toFixed(2) || '—'}
                  </span>
                  <NumberField
                    size="sm"
                    value={item.actualUnitPrice ?? null}
                    stepRef={item.plannedUnitPrice}
                    onCommit={v => {
                      setShoppingItems(prev => prev.map(i => 
                        i.ingredientId === item.ingredientId 
                          ? { ...i, actualUnitPrice: v ?? undefined }
                          : i
                      ) as ShoppingItem[]);
                    }}
                    testId={`modal-input-${item.ingredientId}`}
                    ariaLabel={`Фактическая цена: ${item.ingredientName}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button 
                onClick={() => {
                  setShowModal(false);
                  showSuccess('Чек сохранён');
                }}
                className="grad-btn flex-1"
              >
                Сохранить чек
              </button>
              <button 
                onClick={() => setShowModal(false)}
                className="ghost-btn flex-1"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
