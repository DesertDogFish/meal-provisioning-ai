import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface RecipeSearchOption {
  value: string;
  label: string;
  /** Подпись второй строки (например, тип блюда или состав) */
  hint?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: RecipeSearchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** FORM-meal-composition-spec §2.1: проброс текущего запроса наружу (для серверного поиска с debounce) */
  onQueryChange?: (query: string) => void;
}

/**
 * UX: поиск по блюдам вместо выпадающего списка на сотню строк.
 * Компактное поле с фильтрацией по подстроке (регистронезависимо, «ё»≈«е»),
 * прокручиваемый ограниченный список результатов, полная клавиатурная навигация:
 *  - ввод с клавиатуры сразу фильтрует;
 *  - ArrowUp/ArrowDown — перемещение по результатам, Enter — выбор;
 *  - Esc — закрыть раскрывающийся список (или очистить поле при пустом списке).
 */
export default function RecipeSearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Начните вводить название блюда…',
  searchPlaceholder,
  emptyText = 'Ничего не найдено',
  ariaLabel,
  autoFocus,
  onQueryChange,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find(o => o.value === value);

  const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter(o => normalize(o.label).includes(q) || normalize(o.hint ?? '').includes(q));
  }, [options, query]);

  // Клик вне компонента закрывает список
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // Подсветка первой подходящей опции при изменении фильтра
  useEffect(() => {
    setActiveIdx(0);
    const el = listRef.current?.children[0] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [query, open]);

  const commit = (opt: RecipeSearchOption | undefined) => {
    if (!opt) return;
    onChange(opt.value);
    setQuery('');
    onQueryChange?.('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { setOpen(true); break; }
        setActiveIdx(i => Math.min(filtered.length - 1, i + 1));
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
        if (open) { e.preventDefault(); setActiveIdx(filtered.length - 1); }
        break;
      case 'Enter':
        e.preventDefault();
        if (open && filtered.length > 0) commit(filtered[activeIdx]);
        else if (filtered.length === 1) commit(filtered[0]);
        else setOpen(true);
        break;
      case 'Escape':
        if (open) { e.stopPropagation(); setOpen(false); }
        break;
    }
  };

  // Прокрутка активной опции в зону видимости при навигации стрелками
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const displayValue = open ? query : (selected ? selected.label : query);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        className="flex items-center gap-2 px-3 rounded-lg"
        style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <Search size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel ?? 'Поиск блюда'}
          autoFocus={autoFocus}
          className="flex-1 py-2.5 bg-transparent outline-none text-sm"
          style={{ color: 'var(--text)', minWidth: 0 }}
          placeholder={placeholder}
          value={displayValue}
          onChange={e => { setQuery(e.target.value); onQueryChange?.(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {selected && !open && (
          <button
            type="button"
            aria-label="Сбросить выбор блюда"
            className="p-1 rounded transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
            onClick={(e) => { e.stopPropagation(); onChange(''); setQuery(''); }}
          >
            <X size={14} />
          </button>
        )}
        <ChevronDown
          size={15}
          style={{
            color: 'var(--muted)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms',
          }}
        />
      </div>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={searchPlaceholder ?? 'Блюда'}
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg shadow-xl py-1"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm" style={{ color: 'var(--muted)' }}>{emptyText}</li>
          )}
          {filtered.map((opt, idx) => (
            <li
              key={`${opt.value}:${idx}`}
              role="option"
              aria-selected={opt.value === value}
              className={
                'px-3 py-2 text-sm cursor-pointer ' +
                (idx === activeIdx ? 'bg-[color-mix(in_srgb,var(--wave-400)_12%,transparent)]' : '')
              }
              style={{ color: opt.value === value ? 'var(--w1)' : 'var(--text)' }}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => commit(opt)}
            >
              <span className="block truncate font-medium">{opt.label}</span>
              {opt.hint && (
                <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>{opt.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
