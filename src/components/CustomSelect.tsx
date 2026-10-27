import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { computeDropdownPosition, type DropdownPosition } from '../utils/dropdownPos';
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
 *
 * Fix-7 (п.12/14): список — ПОРТАЛ в document.body с position:fixed.
 *  - модалка с overflow больше не скроллится от открытого дропдауна;
 *  - ширина списка — по контенту (min = ширина триггера, max = 360px):
 *    длинные категории не уходят в горизонтальный скролл;
 *  - при скролле/ресайзе позиция пересчитывается; триггер ушёл из вьюпорта —
 *    список закрывается.
 */
/**
 * Fix-7 (п.12/14): общий хук дропдауна-в-портале. anchorRef — на контейнер
 * триггера; пока open — считает fixed-позицию списка от rect триггера и
 * пересчитывает её при любом скролле (capture — включая скролл модалок) и ресайзе.
 * Используется CustomSelect и комбобоксами RecipeEditorModal («Категория»,
 * «Продукт») — их списки больше не растягивают контент модалки.
 */
export function usePortalDropdown<T extends HTMLElement>(open: boolean) {
  const anchorRef = useRef<T>(null);
  const [pos, setPos] = useState<DropdownPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos(computeDropdownPosition(
        { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
        { width: window.innerWidth, height: window.innerHeight },
      ));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  return { anchorRef, pos };
}

export function CustomSelect({ value, onChange, options, placeholder, id, name, ariaLabel, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const { anchorRef: rootRef, pos } = usePortalDropdown<HTMLDivElement>(open);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find(o => o.value === value);
  const label = selected ? selected.label : (placeholder ?? 'Выберите…');

  // Клик вне компонента закрывает список. Список живёт в портале — клик по нему
  // «вне» rootRef, поэтому проверяем оба контейнера.
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
      {open && pos && createPortal(
        <ul
          ref={listRef}
          role="listbox"
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
              <span className="cselect-label">{opt.label}</span>
              {/* Fix-6 (п.1): выбранная опция помечена галочкой — видно с ходу */}
              {opt.value === value && <Check size={14} className="cselect-check" aria-hidden />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

export default CustomSelect;
