/**
 * Подзадача 26 аудита (2026-10-29): вкладка «Меню по дням» — вынесена из
 * `TripDetailPage.tsx` (R8/R9). Аккордеон дней, карточки приёмов (TripMealCard),
 * редактор «людей на день», ручные позиции дня и карточка «На весь поход».
 * Компонент презентационный: состояние (раскрытие, редактирование) и все
 * мутации приходят пропсами из страницы/хука `useTripDetail`.
 */
import {
  Plus, Users, ChevronDown, ChevronRight, PackagePlus, X,
} from 'lucide-react';
import { formatAmount } from '../utils/calculations';
import { manualForDay, manualForTrip } from '../utils/manualItems';
import type { TripManualItem } from '../api/tripManualItems';
import { Button } from './Button';
import TripMealCard from './TripMealCard';
import type { AddMealDayContext } from './AddMealModal';
import type { MenuDay } from '../types';
import type { Trip } from '../types/tripDetail';

export interface TripDaysListProps {
  menuByDays: MenuDay[];
  trip: Trip;
  /** U40: ручные позиции (к дню и к походу) */
  manualItems: TripManualItem[];
  expandedDays: ReadonlySet<string>;
  /** id дня, у которого открыт редактор «людей на день» */
  editingDay: string | null;
  dayPeopleOverride: string;
  onToggleDay: (dayId: string) => void;
  onStartEditDay: (dayId: string, current: string) => void;
  onDayPeopleChange: (value: string) => void;
  onSaveDayPeople: (dayId: string) => void;
  onCancelEditDay: () => void;
  /** U40: добавить продукт к дню (не блюдо) */
  onAddDayProduct: (dayId: string, dayLabel: string) => void;
  /** FORM-meal-composition-spec §2.1: модалка «Добавить приём пищи» */
  onAddMeal: (ctx: AddMealDayContext) => void;
  onOpenComposition: (dayId: string, mealId: string) => void;
  onDeleteMeal: (dayId: string, mealId: string, mealName: string, dayDate: string) => void;
  onDeleteManual: (itemId: string, itemName: string) => void;
  /** U40: добавить продукт ко всему походу */
  onAddTripProduct: () => void;
}

export function TripDaysList(props: TripDaysListProps) {
  const {
    menuByDays, trip, manualItems, expandedDays, editingDay, dayPeopleOverride,
    onToggleDay, onStartEditDay, onDayPeopleChange, onSaveDayPeople, onCancelEditDay,
    onAddDayProduct, onAddMeal, onOpenComposition, onDeleteMeal, onDeleteManual,
    onAddTripProduct,
  } = props;
  return (
    <div className="space-y-3">
      {menuByDays.map((day, idx) => {
        const tripDay = trip.days?.[idx];
        if (!tripDay) return null;
        const isExpanded = expandedDays.has(tripDay.id);

        return (
          <div key={tripDay.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div
              className="flex items-center justify-between p-4 cursor-pointer transition-colors"
              onClick={() => onToggleDay(tripDay.id)}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--line-strong) 12%, transparent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown size={18} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={18} style={{ color: 'var(--muted)' }} />}
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>
                    {new Date(day.dayDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{day.meals.length} приёмов пищи • {day.effectivePeople} чел.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tripDay.peopleOverride && (
                  <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }}>
                    {tripDay.peopleOverride} чел.
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onStartEditDay(tripDay.id, tripDay.peopleOverride?.toString() || ''); }}
                  className="p-1.5 rounded transition-colors"
                  style={{ color: 'var(--muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
                  title="Изменить количество людей"
                >
                  <Users size={16} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onAddDayProduct(tripDay.id, new Date(tripDay.dayDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })); }}
                  className="p-1.5 rounded transition-colors"
                  style={{ color: 'var(--muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
                  title="Добавить продукт к дню (не блюдо)"
                  aria-label="Добавить продукт к дню"
                >
                  <PackagePlus size={16} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onAddMeal({ dayId: tripDay.id, dayDate: tripDay.dayDate, dayIndex: idx + 1 }); }}
                  className="p-1.5 rounded transition-colors"
                  style={{ color: 'var(--muted)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
                  title="Добавить приём пищи"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Edit day people */}
            {editingDay === tripDay.id && (
              <div className="px-4 pb-3 flex items-center gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Людей на день:</span>
                <input
                  type="number"
                  min={1}
                  value={dayPeopleOverride}
                  onChange={e => onDayPeopleChange(e.target.value)}
                  className="w-20 px-2 py-1 rounded text-sm outline-none"
                  style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder={trip.defaultPeople.toString()}
                />
                <Button variant="primary" size="sm" onClick={() => onSaveDayPeople(tripDay.id)} aria-label="Сохранить количество людей">OK</Button>
                <Button variant="ghost" size="sm" onClick={onCancelEditDay} aria-label="Отмена">Отмена</Button>
              </div>
            )}

            {/* Meals */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {day.meals.map((meal, mealIdx) => {
                  const tripMeal = tripDay.meals?.[mealIdx];
                  return (
                    <TripMealCard
                      key={mealIdx}
                      meal={meal}
                      tripMeal={tripMeal ?? null}
                      onOpenComposition={(mealId) => onOpenComposition(tripDay.id, mealId)}
                      onDelete={(mealId, mealName) => void onDeleteMeal(tripDay.id, mealId, mealName, tripDay.dayDate)}
                    />
                  );
                })}
                {day.meals.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
                    Нет приёмов пищи. Нажмите + чтобы добавить.
                  </div>
                )}
                {/* U40: ручные позиции дня (антисептик во вторник и т.п.) */}
                {manualForDay(manualItems, tripDay.id).length > 0 && (
                  <div className="px-4 py-2 pl-12 flex flex-wrap gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                    {manualForDay(manualItems, tripDay.id).map(mi => (
                      <span key={mi.id} className="text-xs px-2 py-1 rounded inline-flex items-center gap-1.5"
                        style={{ background: 'color-mix(in srgb, var(--wave-400) 12%, transparent)', color: 'var(--text)' }}>
                        <PackagePlus size={11} style={{ color: 'var(--w1)' }} />
                        {mi.ingredientName}: {formatAmount(mi.amount, mi.unit)}
                        {mi.note ? ` · ${mi.note}` : ''}
                        <button
                          onClick={() => void onDeleteManual(mi.id, mi.ingredientName)}
                          aria-label={`Удалить позицию: ${mi.ingredientName}`}
                          className="p-0.5 rounded"
                          style={{ color: 'var(--muted)' }}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Fix-4 (п.3): «Продукты к походу» — не одинокая кнопка в шапке, а
          логичная карточка-«дополнительный день» в конце списка дней: те же
          формы/чипы, что у дней, понятно что это про ВЕСЬ поход. */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px dashed var(--line-strong)' }}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-[10px]" style={{ background: 'color-mix(in srgb, var(--wave-400) 12%, transparent)' }}>
              <PackagePlus size={18} style={{ color: 'var(--w1)' }} />
            </span>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>На весь поход</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Не блюда: аптечка, антисептик, топливо… {manualForTrip(manualItems).length > 0 ? `· ${manualForTrip(manualItems).length} поз.` : ''}
              </p>
            </div>
          </div>
          {/* Fix-6 (п.2): та же иконка-кнопка, что у дня («добавить продукт»), — единообразно */}
          <button
            onClick={onAddTripProduct}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
            title="Добавить продукт к походу (не блюдо)"
            aria-label="Добавить продукт к походу"
          >
            <PackagePlus size={16} />
          </button>
        </div>
        {manualForTrip(manualItems).length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {manualForTrip(manualItems).map(mi => (
              <span key={mi.id} className="text-xs px-2 py-1 rounded inline-flex items-center gap-1.5"
                style={{ background: 'color-mix(in srgb, var(--wave-400) 12%, transparent)', color: 'var(--text)' }}>
                <PackagePlus size={11} style={{ color: 'var(--w1)' }} />
                {mi.ingredientName}: {formatAmount(mi.amount, mi.unit)}
                {mi.note ? ` · ${mi.note}` : ''}
                <button
                  onClick={() => void onDeleteManual(mi.id, mi.ingredientName)}
                  aria-label={`Удалить позицию: ${mi.ingredientName}`}
                  className="p-0.5 rounded"
                  style={{ color: 'var(--muted)' }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TripDaysList;
