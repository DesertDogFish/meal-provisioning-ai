import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { usePortalDropdown } from './CustomSelect';
import './CustomSelect.css';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  /** выбранные значения (пустой массив — «фильтр не задан») */
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  /** подпись триггера при пустом выборе (по умолчанию «Выберите…») */
  emptyLabel?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * bugs-products-catalog п.4: мультиселект фильтров каталога. Общий портал-хук
 * и стили — из CustomSelect (R8: без второго дропдаун-механизма); отличие —
 * значение-список: клик по опции тоглит выбор и НЕ закрывает список
 * (закрытие — клик вне / Escape / повторный клик по триггеру).
 */
export function CustomMultiSelect({
  values, onChange, options, emptyLabel = 'Выберите…', ariaLabel, id, disabled, className,
}: Props) {
  const [open, setOpen] = useState(false);
  const { anchorRef: rootRef, pos } = usePortalDropdown<HTMLDivElement>(open);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedLabels = options.filter(o => values.includes(o.value)).map(o => o.label);
  const summary = selectedLabels.length === 0
    ? emptyLabel
    : selectedLabels.length === 1
      ? selectedLabels[0]
      : `${selectedLabels[0]} +${selectedLabels.length - 1}`;

  // Клик вне компонента закрывает список (список живёт в портале — проверяем оба контейнера).
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open, rootRef]);

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter(v => v !== value) : [...values, value]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        setOpen(o => !o);
        break;
      case 'Escape':
        if (open) { e.stopPropagation(); setOpen(false); }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={`cselect ${className ?? ''}`} style={{ position: 'relative' }}>
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
        <span className="cselect-value">{summary}</span>
        <ChevronDown size={15} className={`cselect-arrow ${open ? 'rotated' : ''}`} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          aria-multiselectable
          aria-label={ariaLabel}
          className="cselect-list"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: pos.minWidth,
            maxWidth: pos.maxWidth,
            maxHeight: pos.maxHeight,
            zIndex: 110, // выше --z-modal (90): дропдаун в модалке не обрезается
          }}
        >
          {options.map(opt => {
            const selected = values.includes(opt.value);
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={selected}
                className={`cselect-option ${selected ? 'selected' : ''}`}
                onClick={() => toggle(opt.value)}
              >
                <span className="cselect-label">{opt.label}</span>
                {selected && <Check size={14} className="cselect-check" aria-hidden />}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}

export default CustomMultiSelect;
