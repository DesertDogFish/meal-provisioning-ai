import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './CustomSelect.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  /** '' — «ничего не выбрано» (аналог <option value=""> в нативном select) */
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  /** name скрытого нативного input (для совместимости с формами/тестами от <select>) */
  name?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Фаза 13 (UX): замена нативных <select>. Тёмная тема, анимация появления,
 * полная поддержка клавиатуры:
 *  - Enter/Space — открыть/выбрать;
 *  - Esc — закрыть;
 *  - стрелки — навигация по опциям;
 *  - Tab — как у обычного контрола (роль listbox + option позволяет это).
 * Значение всегда строковое — совместимо со старыми `<select value={...}>`.
 */
export function CustomSelect({ value, onChange, options, placeholder, id, name, ariaLabel, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find(o => o.value === value);
  const label = selected ? selected.label : (placeholder ?? 'Выберите…');

  // Клик вне компонента закрывает список
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // При открытии подсвечиваем текущее значение и скроллим к нему
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, options.findIndex(o => o.value === value));
    setActiveIdx(idx);
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open) commit(activeIdx);
        else setOpen(true);
        break;
      case 'Escape':
        if (open) { e.stopPropagation(); setOpen(false); }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { setOpen(true); break; }
        setActiveIdx(i => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) { setOpen(true); break; }
        setActiveIdx(i => Math.max(0, i - 1));
        break;
      case 'Home':
        if (open) { e.preventDefault(); setActiveIdx(0); }
        break;
      case 'End':
        if (open) { e.preventDefault(); setActiveIdx(options.length - 1); }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={`cselect ${className ?? ''}`} style={{ position: 'relative' }}>
      {/* name/value проброшены на скрытом нативном input: формы и тесты
          продолжают находить контрол по name (как у <select>), а submit
          получает значение без изменений. */}
      <input type="hidden" name={name} value={value} readOnly />
      <button
        type="button"
        id={id}
        className="cselect-trigger"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
      >
        <span className="cselect-value" data-value={value}>{label}</span>
        <ChevronDown size={15} className={`cselect-arrow ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <ul ref={listRef} role="listbox" aria-label={ariaLabel} className="cselect-list">
          {options.map((opt, idx) => (
            <li
              key={`${opt.value}:${idx}`}
              role="option"
              aria-selected={opt.value === value}
              className={[
                'cselect-option',
                idx === activeIdx ? 'active' : '',
                opt.value === value ? 'selected' : '',
              ].filter(Boolean).join(' ')}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => commit(idx)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CustomSelect;
