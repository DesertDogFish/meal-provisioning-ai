import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import RecipeSearchSelect, { type RecipeSearchOption } from './RecipeSearchSelect';
import AmountInput from './AmountInput';
import { Button } from './Button';
import type { UnitOfMeasure } from '../types';

export interface ProductAddRowProps {
  /** опции поиска (справочник продуктов) */
  options: RecipeSearchOption[];
  /** выбранный продукт ('' — ничего не выбрано) */
  value: string;
  onValueChange: (value: string) => void;
  /** проброс текущего запроса (для free-text «создать продукт») */
  onQueryChange?: (query: string) => void;
  amount: number | null;
  onAmountChange: (value: number | null) => void;
  /** единица выбранного продукта — AmountInput показывает г/мл или шт/уп */
  unit: UnitOfMeasure;
  searchAriaLabel: string;
  searchPlaceholder?: string;
  searchEmptyText?: string;
  amountAriaLabel?: string;
  amountTestId?: string;
  /** клик по «Добавить»; без него строка = поиск + кол-во (паттерн RecipeIngredientsEditor) */
  onAdd?: () => void;
  addLabel?: string;
  addAriaLabel?: string;
  addBusy?: boolean;
  disabled?: boolean;
  rowTestId?: string;
  /** контекстные блоки ПОД строкой (подтверждения merge/новый продукт, free-text-создание) */
  children?: ReactNode;
}

/**
 * bugs-trip-menu-stage п.4 (связь: bugs-recipes-catalog п.5): ЕДИНЫЙ простой
 * блок добавления продукта — одна строка «поиск + кол-во + добавить» без
 * многоуровневых лейблов-заголовков (образец — строка добавления в
 * RecipeIngredientsEditor). Переиспользует RecipeSearchSelect (R8: не третий
 * параллельный поисковый контрол); логика (merge-подтверждения, free-text
 * «создать продукт») остаётся у родителей и рендерится слотом children.
 */
export function ProductAddRow({
  options, value, onValueChange, onQueryChange,
  amount, onAmountChange, unit,
  searchAriaLabel, searchPlaceholder, searchEmptyText,
  amountAriaLabel = 'Количество', amountTestId,
  onAdd, addLabel = 'Добавить', addAriaLabel, addBusy, disabled,
  rowTestId = 'product-add-row',
  children,
}: ProductAddRowProps) {
  return (
    <div className="product-add">
      <div className="flex flex-wrap items-center gap-2" data-testid={rowTestId}>
        <div className="flex-1" style={{ minWidth: 200 }}>
          <RecipeSearchSelect
            value={value}
            onChange={onValueChange}
            onQueryChange={onQueryChange}
            options={options}
            placeholder={searchPlaceholder}
            emptyText={searchEmptyText}
            ariaLabel={searchAriaLabel}
          />
        </div>
        <AmountInput
          value={amount}
          unit={unit}
          onChange={onAmountChange}
          ariaLabel={amountAriaLabel}
          testId={amountTestId}
          disabled={disabled}
        />
        {onAdd && (
          <Button
            variant="primary"
            onClick={onAdd}
            disabled={disabled || addBusy}
            aria-label={addAriaLabel}
            style={{ height: 'var(--h-control, 40px)' }}
          >
            <Plus size={14} /> {addBusy ? 'Добавляем…' : addLabel}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

export default ProductAddRow;
