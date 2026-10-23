import React from 'react';
import s from './Input.module.css';

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  success?: string;
  onClear?: () => void;
};

/** Поле ввода с hint/error/success и опциональной очисткой. */
export const Input = React.forwardRef<HTMLInputElement, Props>(
  ({ label, hint, error, success, onClear, className, id, ...rest }, ref) => {
    const inputId = id || React.useId();
    const state = error ? 'err' : success ? 'ok' : '';
    return (
      <div className={s.wrap}>
        {label && <label className={s.lbl} htmlFor={inputId}>{label}</label>}
        <div className={s.box}>
          <input
            ref={ref}
            id={inputId}
            className={[s.inp, s[state], onClear ? s.hasClear : ''].filter(Boolean).join(' ')}
            aria-invalid={!!error || undefined}
            aria-describedby={hint || error || success ? `${inputId}-h` : undefined}
            {...rest}
          />
          {onClear && (
            <button type="button" className={s.clear} aria-label="Очистить" onClick={onClear}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          )}
        </div>
        {(hint || error || success) && (
          <p id={`${inputId}-h`} className={[s.hint, error ? s.err : success ? s.ok : ''].join(' ')}>
            {error || success || hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
