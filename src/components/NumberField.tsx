import { useEffect, useState } from 'react';

/**
 * Адаптивный шаг: порядок данных − 1
 * Сотни → 10, тысячи → 100, десятки → 1, 0.5 → 0.01, 0.005 → 0.0001
 */
export function adaptiveStep(ref: number | null | undefined): number {
  const r = Math.max(ref ?? 10, 0.0001);
  const e = Math.floor(Math.log10(r));
  return +Math.pow(10, e - 1).toFixed(4);
}

const round = (v: number, d: number) => +v.toFixed(d);

interface NumberFieldProps {
  value: number | null;
  onCommit: (v: number | null) => void;
  /** Порядок данных для шага: план ?? текущее ?? 10 */
  stepRef?: number | null;
  placeholder?: string;
  min?: number;
  maxDecimals?: number;   // округление при коммите
  minStep?: number;       // кламп шага (админка: 0.001 под NUMERIC(14,3))
  size?: 'md' | 'sm';
  testId?: string;
  ariaLabel?: string;
}

export function NumberField({
  value, onCommit, stepRef, placeholder = '= план', min = 0,
  maxDecimals = 2, minStep = 0, size = 'md', testId, ariaLabel,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value));
  useEffect(() => setDraft(value == null ? '' : String(value)), [value]);

  const ref = stepRef ?? value ?? 10;
  const step = Math.max(adaptiveStep(ref), minStep);
  const decimals = maxDecimals;

  const commit = (raw: string) => {
    if (raw.trim() === '') return onCommit(null);
    const n = parseFloat(raw.replace(',', '.'));
    if (Number.isNaN(n)) return setDraft(value == null ? '' : String(value));
    onCommit(round(Math.max(min, n), decimals));
  };

  const bump = (dir: 1 | -1) => {
    const base = value ?? stepRef ?? 0;
    onCommit(round(Math.max(min, base + dir * step), decimals));
  };

  return (
    <span className={`nf nf-${size}`} data-testid={testId ? `${testId}-wrap` : undefined}>
      <button 
        type="button" 
        className="nf-btn" 
        aria-label="Уменьшить" 
        title={`−${step}`}
        onClick={() => bump(-1)}
      >
        −
      </button>
      <input
        className="nf-input" 
        type="number" 
        inputMode="decimal" 
        step={step}
        data-testid={testId} 
        aria-label={ariaLabel} 
        placeholder={placeholder}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { 
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(1);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(-1);
          }
        }}
      />
      <button 
        type="button" 
        className="nf-btn" 
        aria-label="Увеличить" 
        title={`+${step}`}
        onClick={() => bump(1)}
      >
        +
      </button>
    </span>
  );
}
