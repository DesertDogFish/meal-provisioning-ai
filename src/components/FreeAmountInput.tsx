import { useEffect, useRef, useState } from 'react';
import { defaultUnit, unitOptions, type ActualAmount } from '../utils/checkUnits';

/**
 * Fix-6 (п.8): свободный ввод фактического количества — «беру 300 г», «2 кг»,
 * «3 шт», независимо от учётной единицы продукта. Компактен для строк чеклиста
 * и колонок чека; единицы — чипы справа от поля (единый стиль с AmountInput).
 */
export interface FreeAmountInputProps {
  value: ActualAmount | null;
  /** учётная единица продукта (KG/L/PCS/PACK) */
  baseUnit: string;
  /** вес штуки/упаковки в граммах — открывает «г/кг» для штучных товаров */
  pieceWeightG?: number | null;
  onChange: (value: ActualAmount | null) => void;
  ariaLabel?: string;
  testId?: string;
  disabled?: boolean;
}

const parseNum = (raw: string): number | null => {
  const cleaned = raw.replace(',', '.').replace(/\s+/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function FreeAmountInput({
  value, baseUnit, pieceWeightG, onChange, ariaLabel, testId, disabled,
}: FreeAmountInputProps) {
  const options = unitOptions(baseUnit, pieceWeightG);
  const [unit, setUnitState] = useState<string>(value?.unit || defaultUnit(baseUnit));
  const [text, setText] = useState<string>(
    value != null ? String(value.amount).replace('.', ',') : '',
  );
  const focused = useRef(false);

  // внешний сброс/загрузка (не в фокусе) — синхронизируем текст и единицу
  useEffect(() => {
    if (focused.current) return;
    if (value == null) { setText(''); return; }
    setText(String(value.amount).replace('.', ','));
    if (value.unit && value.unit !== unit) setUnitState(value.unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (rawText: string, u: string) => {
    const n = parseNum(rawText);
    if (n == null) { onChange(null); return; }
    onChange({ amount: n, unit: u });
  };

  const setUnit = (u: string) => {
    if (u === unit) return;
    setUnitState(u);
    emit(text, u);
  };

  return (
    <span
      className="inline-flex items-stretch overflow-hidden"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--elev)',
        borderRadius: 'var(--r-input, 8px) 0 0 var(--r-input, 8px)',
        opacity: disabled ? 0.5 : 1,
      }}
      data-testid={testId ? `${testId}-wrap` : undefined}
    >
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid={testId}
        value={text}
        placeholder="—"
        onFocus={() => { focused.current = true; }}
        onBlur={() => {
          focused.current = false;
          setText(value != null ? String(value.amount).replace('.', ',') : '');
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw !== '' && !/^[\d\s]*[.,]?[\d\s]*$/.test(raw)) return;
          setText(raw);
          emit(raw, unit);
        }}
        className="px-2 py-1.5 w-16 text-right text-sm outline-none bg-transparent"
        style={{ color: 'var(--text)' }}
      />
      <span className="flex flex-col items-stretch" style={{ borderLeft: '1px solid var(--border)' }}>
        {options.map((u) => (
          <button
            key={u}
            type="button"
            disabled={disabled}
            aria-label={`Единица: ${u}`}
            aria-pressed={unit === u}
            onClick={() => setUnit(u)}
            className="flex-1 px-1.5 text-[10px] leading-none flex items-center justify-center transition-colors"
            style={{
              color: unit === u ? 'var(--on-fire)' : 'var(--muted)',
              fontWeight: unit === u ? 700 : 400,
              background: unit === u ? 'var(--wave-400)' : 'transparent',
            }}
          >
            {u}
          </button>
        ))}
      </span>
    </span>
  );
}

export default FreeAmountInput;
