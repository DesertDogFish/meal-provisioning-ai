import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from './ToastProvider';
import { Download } from 'lucide-react';
import { formatAmount, calculateShoppingList, calculateDayShopping } from '../utils/calculations';
import { NumberField } from './NumberField';

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

export default function PriceOverridesTab({ tripId }: Props) {
  const { state } = useApp();
  const { showError, showSuccess } = useToast();
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [dayShopping, setDayShopping] = useState<DayShopping[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('total');
  const [showModal, setShowModal] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);

  const trip = state.trips.find(t => t.id === tripId);

  // Загрузка данных из моковых данных
  useEffect(() => {
    if (!trip) {
      console.warn('PriceOverridesTab: trip not found for id', tripId);
      return;
    }

    console.log('=== PriceOverridesTab: loading data ===');
    console.log('Trip:', trip.name);
    console.log('  - trip.days:', trip.days?.length || 0);
    console.log('  - trip.days[0]?.meals:', trip.days?.[0]?.meals?.length || 0);
    console.log('  - state.recipes:', state.recipes.length);
    console.log('  - state.prices:', state.prices.length);
    console.log('  - state.ingredients:', state.ingredients.length);

    // Расчёт списка закупок
    const recipesMap = new Map(state.recipes.map(r => [r.id, r]));
    
    // Проверяем, что рецепты имеют ингредиенты
    if (state.recipes.length > 0) {
      const firstRecipe = state.recipes[0];
      console.log('  - first recipe:', firstRecipe.name);
      console.log('    - ingredients count:', firstRecipe.ingredients?.length || 0);
      if (firstRecipe.ingredients && firstRecipe.ingredients.length > 0) {
        const firstIng = firstRecipe.ingredients[0];
        console.log('    - first ingredient:', {
          ingredientId: firstIng.ingredientId,
          amount: firstIng.amount,
          hasIngredientData: !!firstIng.ingredient,
          ingredientName: firstIng.ingredient?.name,
          ingredientUnit: firstIng.ingredient?.unit
        });
      }
    }
    
    // Проверяем, что в recipesMap есть все рецепты
    console.log('  - recipesMap size:', recipesMap.size);
    if (trip.days && trip.days.length > 0 && trip.days[0].meals && trip.days[0].meals.length > 0) {
      const firstMealRecipeId = trip.days[0].meals[0].recipeId;
      console.log('  - first meal recipeId:', firstMealRecipeId);
      console.log('  - recipe found in map:', recipesMap.has(firstMealRecipeId));
      const recipeFromMap = recipesMap.get(firstMealRecipeId);
      if (recipeFromMap) {
        console.log('    - recipe name:', recipeFromMap.name);
        console.log('    - recipe ingredients:', recipeFromMap.ingredients?.length || 0);
      }
    }
    
    // Проверяем, что в походе есть приёмы пищи
    if (trip.days && trip.days.length > 0) {
      const firstDay = trip.days[0];
      console.log('  - first day:', firstDay.dayDate);
      console.log('    - meals count:', firstDay.meals?.length || 0);
      if (firstDay.meals && firstDay.meals.length > 0) {
        const firstMeal = firstDay.meals[0];
        console.log('    - first meal:', {
          mealType: firstMeal.mealType,
          recipeId: firstMeal.recipeId,
          hasRecipe: !!firstMeal.recipe,
          recipeName: firstMeal.recipe?.name
        });
      }
    }
    
    try {
      const shopping = calculateShoppingList(trip, recipesMap, state.prices);
      
      console.log('  - shopping items calculated:', shopping.length);
      if (shopping.length > 0) {
        console.log('  - first shopping item:', shopping[0]);
      }

      // Преобразование в формат ShoppingItem
      const items: ShoppingItem[] = shopping.map(item => {
        const unitPrice = item.estimatedCost && item.totalAmount > 0 
          ? item.estimatedCost / item.totalAmount 
          : undefined;
        
        return {
          ingredientId: item.ingredientId,
          ingredientName: item.ingredientName || 'Unknown',
          unit: item.unit || 'PCS',
          totalAmount: item.totalAmount,
          plannedUnitPrice: unitPrice,
          actualUnitPrice: unitPrice,
          plannedCost: item.estimatedCost,
          actualCost: item.estimatedCost,
          overridden: false,
          hasPlannedPrice: item.hasPrice
        };
      });
      
      console.log('  - converted items:', items.length);
      setShoppingItems(items);

      // Расчёт закупок по дням
      const dayShoppingData = calculateDayShopping(trip, recipesMap, state.prices);
      console.log('  - day shopping calculated:', dayShoppingData.length);
      
      setDayShopping(dayShoppingData.map(d => ({
        dayDate: d.dayDate,
        plannedCost: d.dayCost,
        actualCost: d.dayCost
      })));
    } catch (error) {
      console.error('Error calculating shopping list:', error);
      showError('Ошибка расчёта закупок: ' + (error as Error).message);
    }
  }, [tripId, trip, state.recipes, state.prices, showError]);

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

  const defaultPeople = trip?.defaultPeople || 1;
  const totalPersonMeals = trip?.days?.reduce((acc, d) => 
    acc + (d.meals?.reduce((mealAcc, m) => mealAcc + (m.peopleOverride || d.peopleOverride || trip.defaultPeople), 0) || 0)
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
