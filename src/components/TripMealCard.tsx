/**
 * Подзадача 26 аудита (2026-10-29): карточка приёма пищи в меню по дням —
 * вынесена из `TripDetailPage.tsx` (R8/R9). Компонент презентационный:
 * состав/удаление — колбэками наверх (модалки и подтверждения живут в странице).
 */
import { ListChecks, Trash2 } from 'lucide-react';
import { formatAmount } from '../utils/calculations';
import { servingsWord } from '../utils/text';
import type { MealType, MenuDay } from '../types';
import type { TripMeal } from '../types/tripDetail';
import { mealTypeLabels } from '../utils/text'; // cleanup-п.9

// cleanup-п.9: лейблы — из utils/text (единый источник)

// Бейджи приёмов пищи в палитре «Провиант» (wave/teal + amber)
// Fix-4 (п.7): четыре РАЗЛИЧИМЫХ цвета приёмов (раньше обед/ужин/перекус сливались
// в один «зелёный»): завтрак — янтарь, обед — волна/тил, ужин — сумеречный синий,
// перекус — коралл. Классы .badge-meal-* в index.css (токены дизайн-пака).
export const mealTypeColors: Record<MealType, string> = {
  BREAKFAST: 'badge-meal-breakfast',
  LUNCH: 'badge-meal-lunch',
  DINNER: 'badge-meal-dinner',
  SNACK: 'badge-meal-snack',
};

export interface TripMealCardProps {
  /** расчётная строка меню (calculateMenuByDays) */
  meal: MenuDay['meals'][number];
  /** серверная сущность приёма (snowshot дня); null — приём ещё не синхронизирован */
  tripMeal?: TripMeal | null;
  /** FORM-meal-composition-spec §2.2: открыть модалку «Состав приёма» */
  onOpenComposition: (mealId: string) => void;
  /** удалить приём (подтверждение — на стороне страницы) */
  onDelete: (mealId: string, mealName: string) => void;
  /** navigation-п.5: название блюда — ссылка на read-only просмотр рецепта */
  onViewRecipe?: (recipeId: string) => void;
}

export function TripMealCard({ meal, tripMeal, onOpenComposition, onDelete, onViewRecipe }: TripMealCardProps) {
  return (
    <div className="meal-row px-4 py-3 pl-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${mealTypeColors[meal.mealType]}`}>
            {mealTypeLabels[meal.mealType]}
          </span>
          {/* navigation-п.5: название блюда открывает рецепт (все роли, 1 тап) */}
          {onViewRecipe && meal.recipeId ? (
            <button
              type="button"
              className="meal-name-link font-medium"
              data-testid="meal-recipe-link"
              onClick={() => onViewRecipe(String(meal.recipeId))}
              title="Открыть рецепт блюда"
              style={{ color: 'var(--text)' }}
            >
              {meal.recipeName}
            </button>
          ) : (
            <span className="font-medium" style={{ color: 'var(--text)' }}>{meal.recipeName}</span>
          )}
          <span className="text-xs" style={{ color: 'var(--muted)' }}>({meal.servings} {servingsWord(meal.servings)})</span>
        </div>
        <div className="flex items-center gap-1">
          {/* FORM-meal-composition-spec §2.2: кнопка-иконка «Состав» на карточке приёма → Модалка B */}
          <button
            onClick={() => tripMeal && onOpenComposition(tripMeal.id)}
            disabled={!tripMeal}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
            title="Состав приёма"
            aria-label={`Состав приёма: ${meal.recipeName ?? ''}`}
          >
            <ListChecks size={14} />
          </button>
          <button
            onClick={() => tripMeal && onDelete(tripMeal.id, meal.recipeName ?? 'приём')}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
            title={`Удалить приём: ${meal.recipeName ?? ''}`}
            aria-label={`Удалить приём пищи: ${meal.recipeName ?? ''}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {/* U30: добавленные в походе позиции видны рядом со «старыми»
            ингредиентами (бейдж «+»), замены подписываются источником */}
        {meal.ingredients.map((ing, i) => (
          <span
            key={i}
            className="text-xs px-2 py-0.5 rounded"
            title={ing.added ? 'Добавлено в походе' : ing.substitutedFrom ? `Замена: ${ing.substitutedFrom} → ${ing.name}` : undefined}
            style={ing.added ? {
              background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)',
              color: 'var(--w1)',
              border: '1px solid color-mix(in srgb, var(--wave-400) 40%, transparent)',
              fontWeight: 600,
            } : { background: 'var(--elev)', color: 'var(--muted)' }}
          >
            {ing.added ? '+ ' : ''}{ing.name}: {formatAmount(ing.amount, ing.unit)}
            {ing.substitutedFrom ? ` ← ${ing.substitutedFrom}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export default TripMealCard;
