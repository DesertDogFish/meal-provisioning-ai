import { useEffect, useRef, useState } from 'react';
import { formatQty } from '../utils/format';

/**
 * U31 (список багов 26.10): «одни дроби какие-то… не хочу вводить 0,015 кг».
 * Умное поле количества:
 *  - KG/L — ввод в граммах/миллилитрах с переключателем «г ↔ кг» («мл ↔ л»);
 *    режим по умолчанию: значение < 1 базовой единицы → граммы, иначе → кг;
 *    под полем — подсказка эквивалента («= 15 г» / «= 1,2 кг»);
 *  - PCS/PACK — обычный ввод в штуках/упаковках;
 *  - десятичный разделитель — запятая ИЛИ точка (parseAmount-семантика).
 *
 * Значение наружу отдаётся ВСЕГДА в базовых единицах (кг/л/шт/уп) — контракт
 * хранения не меняется (T0: KG/L хранят кг/л).
 */

export type AmountUnit = string;

export interface AmountInputProps {
  /** количество в базовых единицах (кг/л/шт/уп) */
  value: number | null;
  unit: AmountUnit;
  onChange: (baseValue: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
  placeholder?: string;
  /** компактный размер (строки таблиц) */
  size?: 'sm' | 'md';
}

/** 'KG' | 'L' — весовые/объёмные единицы с граммовым режимом. */
export function isWeightUnit(unit: AmountUnit | null | undefined): boolean {
  return unit === 'KG' || unit === 'L';
}

export function parseDecimal(raw: string): number | null {
  const cleaned = String(raw).replace(',', '.').replace(/\s+/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Число → текст поля: без хвостовых нулей, запятая как разделитель. */
function toText(n: number): string {
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded).replace('.', ',');
}

type Mode = 'small' | 'base';

export function AmountInput({
  value, unit, onChange, disabled, ariaLabel, testId, placeholder, size = 'md',
}: AmountInputProps) {
  const weight = isWeightUnit(unit);
  const smallLabel = unit === 'L' ? 'мл' : unit === 'KG' ? 'г' : '';
  const baseLabel = unit === 'L' ? 'л' : unit === 'KG' ? 'кг' : unit === 'PCS' ? 'шт' : unit === 'PACK' ? 'уп' : String(unit ?? '');

  const defaultMode: Mode = value != null && Math.abs(value) >= 1 ? 'base' : 'small';
  const [mode, setMode] = useState<Mode>(weight ? defaultMode : 'base');
  const [text, setText] = useState<string>(
    value == null ? '' : toText(weight && mode === 'small' ? value * 1000 : value),
  );
  const focused = useRef(false);
  // переключатель «г↔кг» сам пересчитывает текст — подавляем один ресинк из props,
  // иначе эффект ниже затрёт введённое значение (в тестах/неконтролируемом родителе)
  const skipSync = useRef(false);

  // Синхронизация из props, пока поле не в фокусе (внешние сбросы/загрузка серверных данных)
  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return; }
    if (focused.current) return;
    setText(value == null ? '' : toText(weight && mode === 'small' ? value * 1000 : value));
  }, [value, mode, weight]);

  // Смена единицы (например, выбрали другой продукт в пикере — PCS → KG):
  // режим пересчитывается от текущего значения, иначе «500» осталось бы килограммами.
  // value читаем через ref — эффект должен срабатывать ТОЛЬКО на смену unit.
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (!isWeightUnit(unit)) { setMode('base'); return; }
    const v = valueRef.current;
    setMode(v != null && Math.abs(v) >= 1 ? 'base' : 'small');
  }, [unit]);

  const emit = (raw: string, m: Mode) => {
    const n = parseDecimal(raw);
    if (n == null || n < 0) return;
    // Не эмитим промежуточный 0 («0,5» печатается с ведущего нуля): иначе строка
    // состава в Модалке B на нуле мгновенно становится EXCLUDED и поле пропадает.
    // Исключение позиции — отдельная кнопка «Искл.», ноль количеством не вводится.
    if (n === 0) return;
    onChange(weight && m === 'small' ? n / 1000 : n);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    // пересчитываем введённый текст в новый режим, чтобы значение не потерялось
    const n = parseDecimal(text);
    skipSync.current = true;
    setMode(next);
    if (n != null && n >= 0) {
      const base = mode === 'small' ? n / 1000 : n;
      const shown = next === 'small' ? base * 1000 : base;
      setText(toText(shown));
      onChange(base);
    }
  };

  const baseValue = (() => {
    const n = parseDecimal(text);
    if (n == null) return null;
    return weight && mode === 'small' ? n / 1000 : n;
  })();

  // Подсказка-эквивалент: в граммовом режиме ≥1000 г → «= 1,2 кг», в кг <1 → «= 15 г»
  const hint = (() => {
    if (!weight || baseValue == null || baseValue <= 0) return null;
    if (mode === 'small' && baseValue >= 1) return `= ${formatQty(baseValue, unit)}`;
    if (mode === 'base' && baseValue < 1) return `= ${formatQty(baseValue, unit)}`;
    return null;
  })();

  const pad = size === 'sm' ? 'px-2 py-1' : 'px-2 py-1.5';

  return (
    <span className="inline-flex items-center gap-1" data-testid={testId ? `${testId}-wrap` : undefined}>
      <span className="inline-flex items-center rounded" style={{ border: '1px solid var(--border)', background: 'var(--elev)' }}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          data-testid={testId}
          disabled={disabled}
          value={text}
          placeholder={placeholder ?? '0'}
          onFocus={() => { focused.current = true; }}
          onBlur={() => {
            focused.current = false;
            // нормализуем текст из props (например, «15,500» → «15,5»; пусто при null)
            setText(value == null ? '' : toText(weight && mode === 'small' ? value * 1000 : value));
          }}
          onChange={(e) => {
            const raw = e.target.value;
            // разрешаем цифры, запятую/точку и пустую строку
            if (raw !== '' && !/^[\d\s]*[.,]?[\d\s]*$/.test(raw)) return;
            setText(raw);
            emit(raw, mode);
          }}
          className={`${pad} w-20 rounded-l text-right text-sm outline-none bg-transparent`}
          style={{ color: 'var(--text)' }}
        />
        {weight ? (
          <span className="flex items-stretch" style={{ borderLeft: '1px solid var(--border)' }}>
            <button
              type="button"
              aria-label={`Единица: ${smallLabel}`}
              aria-pressed={mode === 'small'}
              onClick={() => switchMode('small')}
              className="px-1.5 text-xs transition-colors"
              style={{
                color: mode === 'small' ? 'var(--w1)' : 'var(--muted)',
                fontWeight: mode === 'small' ? 700 : 400,
                background: mode === 'small' ? 'color-mix(in srgb, var(--wave-400) 10%, transparent)' : 'transparent',
              }}
            >
              {smallLabel}
            </button>
            <button
              type="button"
              aria-label={`Единица: ${baseLabel}`}
              aria-pressed={mode === 'base'}
              onClick={() => switchMode('base')}
              className="px-1.5 text-xs transition-colors rounded-r"
              style={{
                color: mode === 'base' ? 'var(--w1)' : 'var(--muted)',
                fontWeight: mode === 'base' ? 700 : 400,
                background: mode === 'base' ? 'color-mix(in srgb, var(--wave-400) 10%, transparent)' : 'transparent',
              }}
            >
              {baseLabel}
            </button>
          </span>
        ) : (
          <span
            className="px-2 text-xs"
            style={{ color: 'var(--muted)', borderLeft: '1px solid var(--border)' }}
            aria-hidden
          >
            {baseLabel}
          </span>
        )}
      </span>
      {hint && (
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--muted)' }} data-testid={testId ? `${testId}-hint` : undefined}>
          {hint}
        </span>
      )}
    </span>
  );
}

export default AmountInput;
