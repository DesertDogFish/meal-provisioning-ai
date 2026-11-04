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
// UX-осмотр 31.10 (п.1): форма слова «N приёмов пищи» — из единого источника (text.ts)
import { mealsCountLabel } from '../utils/text';
import { manualForDay, manualForTrip } from '../utils/manualItems';
import type { TripManualItem } from '../api/tripManualItems';
import type { MenuDay } from '../types';
import type { Trip } from '../types/tripDetail';

import { Button } from './Button';
import InfoTip from './InfoTip';
import TripMealCard from './TripMealCard';
import type { AddMealDayContext } from './AddMealModal';

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
  /** navigation-п.5: название блюда в карточке приёма — просмотр рецепта */
  onViewRecipe?: (recipeId: string) => void;
  onDeleteMeal: (dayId: string, mealId: string, mealName: string, dayDate: string) => void;
  onDeleteManual: (itemId: string, itemName: string) => void;
  /** U40: добавить продукт ко всему походу */
  onAddTripProduct: () => void;
}

export function TripDaysList(props: TripDaysListProps) {
  const {
    menuByDays, trip, manualItems, expandedDays, editingDay, dayPeopleOverride,
    onToggleDay, onStartEditDay, onDayPeopleChange, onSaveDayPeople, onCancelEditDay,
    onAddDayProduct, onAddMeal, onOpenComposition, onDeleteMeal, onDeleteManual, onViewRecipe,
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
              data-testid={`day-header-${tripDay.id}`}
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
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{mealsCountLabel(day.meals.length)} • {day.effectivePeople} чел.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tripDay.peopleOverride && (
                  <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }}>
                    {tripDay.peopleOverride} чел.
                  </span>
                )}
                {/* bugs-app-ui п.5: иконки действий — .icon-action (рыжие), без инлайновых
                    цветов и JS-ховеров; bugs-trip-menu-stage п.3: «Добавить продукт или товар» */}
                <button
                  onClick={(e) => { e.stopPropagation(); onStartEditDay(tripDay.id, tripDay.peopleOverride?.toString() || ''); }}
                  className="icon-action p-1.5 rounded touch-hit"
                  title="Изменить количество людей"
                  aria-label="Изменить количество людей"
                >
                  <Users size={16} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onAddDayProduct(tripDay.id, new Date(tripDay.dayDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })); }}
                  className="icon-action p-1.5 rounded touch-hit"
                  title="Добавить продукт или товар"
                  aria-label="Добавить продукт или товар"
                >
                  <PackagePlus size={16} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onAddMeal({ dayId: tripDay.id, dayDate: tripDay.dayDate, dayIndex: idx + 1 }); }}
                  className="icon-action p-1.5 rounded touch-hit"
                  title="Добавить приём пищи"
                  aria-label="Добавить приём пищи"
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
                      onViewRecipe={onViewRecipe}
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
                          className="icon-action p-0.5 rounded"
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
              {/* bugs-trip-menu-stage пп.1–2: заголовок приглашает добавить, когда
                  позиций ещё нет; пояснение про ручные позиции — в InfoTip, счётчик
                  «N поз.» сохранён в заголовке */}
              <p className="font-semibold flex items-center gap-1.5 keep-pair" style={{ color: 'var(--text)' }}>
                {manualForTrip(manualItems).length > 0
                  ? <>Продукты и товары <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>· {manualForTrip(manualItems).length} поз.</span></>
                  : 'Добавить дополнительные продукты и товары…'}
                <InfoTip
                  label="Что добавляют к походу"
                  text="Ручные позиции: аптечка, антисептик, топливо… — продукты и товары, которые берутся на весь поход, а не в конкретный день. Они попадают в закупку и в чек наравне с ингредиентами блюд."
                />
              </p>
            </div>
          </div>
          {/* Fix-6 (п.2): та же иконка-кнопка, что у дня («добавить продукт»), — единообразно;
              bugs-trip-menu-stage п.3 — та же формулировка, bugs-app-ui п.5 — .icon-action */}
          <button
            onClick={onAddTripProduct}
            className="icon-action p-1.5 rounded touch-hit"
            title="Добавить продукт или товар (на весь поход)"
            aria-label="Добавить продукт или товар (на весь поход)"
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
                  className="icon-action p-0.5 rounded"
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
