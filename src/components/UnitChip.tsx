import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import BottomSheet from './BottomSheet';

/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадачи 5/9): UnitChip —
 * единица измерения чипом справа от поля ввода вместо вертикального стека
 * «г/кг» (на телефоне стеки были мельче 12px и попадались пальцем в соседнюю
 * единицу). Тап по чипу открывает bottom-sheet единиц: цели ≥44px, Esc/клик
 * вне закрывают, фокус возвращается на чип (BottomSheet).
 *
 * Опции — прежние `unitOptions(baseUnit, pieceWeightG)` из utils/checkUnits:
 * поведение выбора единицы не меняется, меняется только контрол.
 */
export interface UnitChipProps {
  unit: string;
  options: string[];
  onChange: (unit: string) => void;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
}

export function UnitChip({ unit, options, onChange, disabled, testId, ariaLabel }: UnitChipProps) {
  const [open, setOpen] = useState(false);
  const unique = options.filter((u, i) => options.indexOf(u) === i);

  if (unique.length <= 1) {
    return (
      <span
        className="unit-chip unit-chip--solo"
        data-testid={testId ? `${testId}-solo` : undefined}
        aria-label={ariaLabel ?? `Единица: ${unit}`}
      >
        {unit}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="unit-chip"
        disabled={disabled}
        aria-label={ariaLabel ?? `Единица: ${unit}. Изменить`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={testId ?? 'unit-chip'}
        onClick={() => setOpen(true)}
      >
        {unit}
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <BottomSheet title="Единица измерения" onClose={() => setOpen(false)} testId={testId ? `${testId}-sheet` : 'unit-sheet'}>
          <div role="radiogroup" aria-label="Единица измерения">
            {unique.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={u === unit}
                className="sheet-option"
                data-testid={`unit-option-${u}`}
                onClick={() => {
                  setOpen(false);
                  if (u !== unit) onChange(u);
                }}
              >
                {u}
                {u === unit && <Check size={16} aria-hidden />}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
    </>
  );
}

export default UnitChip;
