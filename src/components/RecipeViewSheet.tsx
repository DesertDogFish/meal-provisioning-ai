/**
 * Navigation-п.5 (2026-10-31): read-only просмотр блюда из меню похода —
 * «полный рецепт в 1 тап» с названия карточки приёма. Данные — снепшот похода
 * (состав уже масштабирован под людей приёма), поэтому состав может отличаться
 * от справочника; ссылка «В справочнике» ведёт в `/recipes?view=<globalId>`
 * и рендерится только когда блюдо резолвится в ЖИВОЙ рецепт каталога
 * (удалённый из каталога рецепт — честная нота без битой ссылки).
 */
import { X, BookOpen } from 'lucide-react';
import Modal from './Modal';
import { Button } from './Button';
import { formatAmount } from '../utils/calculations';
import { mealTypeLabels, servingsWord } from '../utils/text';
import type { Recipe } from '../types/tripDetail';

export interface RecipeViewSheetProps {
  /** блюдо из снепшота похода (или каталога) */
  recipe: Recipe;
  /** людей в приёме (масштаб состава); null — базовая порционность рецепта */
  servings?: number | null;
  /** строки состава, уже масштабированные под приём (из menuByDays) */
  ingredients: { name: string; amount: number; unit: string }[];
  /** id живого рецепта в глобальном каталоге; null — блюда там больше нет */
  catalogRecipeId: string | null;
  onClose: () => void;
  /** переход в каталог (`/recipes?view=<id>`); только при catalogRecipeId != null */
  onOpenInCatalog?: () => void;
}

export function RecipeViewSheet({
  recipe, servings, ingredients, catalogRecipeId, onClose, onOpenInCatalog,
}: RecipeViewSheetProps) {
  const people = servings ?? recipe.baseServings;
  return (
    <Modal onClose={onClose}>
      <div
        className="modal-sheet rounded-2xl shadow-xl w-full max-w-lg p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Блюдо: ${recipe.name}`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{recipe.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              <span
                className="px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap"
                style={{ background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }}
              >
                {mealTypeLabels[recipe.mealType]}
              </span>
              <span className="whitespace-nowrap">{people} {servingsWord(people)}</span>
              {recipe.caloriesPerServing ? (
                <span className="whitespace-nowrap">{Math.round(recipe.caloriesPerServing)} ккал/{servingsWord(1)}</span>
              ) : null}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Закрыть" title="Закрыть">
            <X size={18} />
          </Button>
        </div>

        <p className="cap mb-3" style={{ color: 'var(--text-2)' }} data-testid="recipe-sheet-snapshot-note">
          Данные снепшота похода: состав пересчитан на людей приёма и может отличаться от справочника.
        </p>

        <div className="space-y-2">
          {ingredients.map((ing, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--elev)' }}>
              <span style={{ color: 'var(--text)' }}>{ing.name}</span>
              <span className="keep-num text-sm" style={{ color: 'var(--muted)' }}>{formatAmount(ing.amount, ing.unit)}</span>
            </div>
          ))}
        </div>

        <div className="pt-4">
          {catalogRecipeId != null && onOpenInCatalog ? (
            <Button variant="soft" className="min-h-[44px]" onClick={onOpenInCatalog} data-testid="recipe-sheet-catalog-link">
              <BookOpen size={16} /> В справочнике
            </Button>
          ) : (
            <p className="cap" style={{ color: 'var(--text-2)' }} data-testid="recipe-sheet-no-catalog">
              Это блюдо — снепшот похода: в справочнике его больше нет, ссылка недоступна.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default RecipeViewSheet;
