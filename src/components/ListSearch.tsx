import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * bugs-trip-checks-stage п.7: общий поиск по длинному списку (магазин ③ и
 * чек ④) — ЕДИНСТВЕННЫЙ контрол на оба чеклиста (R8, без дублей).
 *
 * Требования владельца:
 *  (а) контрол прилипает к верху списка — хозяин ставит его в зону
 *      `.checklist-sticky` (position: sticky c учётом safe-area — index.css);
 *  (б) при вводе строка с `data-search-id` получает подсветку `.search-hit` и
 *      `scrollIntoView({ block: 'center' })`; ФОКУС ввода остаётся в поле поиска
 *      (BUG-004, tasks/bugs-list-search-focus.md: программный фокус строки
 *      отменён владельцем 03.11.2026 — иначе невозможно допечатать уточнение);
 *  (в) совпадений несколько — Enter/стрелки перебирают их по кругу;
 *      несовпадение — явная индикация «Не найдено» (role=status) + красная
 *      рамка поля. Озвучка совпадений — aria-live на счётчике `i/N`.
 *
 * Совпадения считаются по ВИДИМЫМ строкам, которые хозяин передал в `items`
 * (фильтр «только недостающие» в ChecklistTab не конфликтует: ищем по тому,
 * что на экране; свёрнутые группы хозяин раскрывает через onQueryChange).
 */
export interface ListSearchItem {
  /** значение `data-search-id` строки в DOM */
  id: string;
  /** текст, по которому ищем (название позиции) */
  text: string;
}

export interface ListSearchProps {
  items: ListSearchItem[];
  placeholder?: string;
  ariaLabel?: string;
  /** префикс testid: `${testId}-input` / `-count` / `-none` / `-clear` */
  testId?: string;
  /** хозяин реагирует на запрос (например, раскрывает свёрнутые группы) */
  onQueryChange?: (query: string) => void;
  /** классы корня (позиционирование — на хозяине) */
  className?: string;
  /**
   * Контейнер со строками (`data-search-id` ищутся внутри него). ОБЯЗАТЕЛЕН,
   * когда на странице два списка с одними id (мобильные строки и десктоп-
   * таблица чека в DOM одновременно) — иначе поиск попадёт в скрытую копию.
   */
  scope?: React.RefObject<HTMLElement | null>;
}

const norm = (t: string): string => t.trim().toLowerCase().replace(/ё/g, 'е');

export function ListSearch({
  items,
  placeholder = 'Найти позицию…',
  ariaLabel = 'Поиск по списку',
  testId = 'list-search',
  onQueryChange,
  className = '',
  scope,
}: ListSearchProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const hitRef = useRef<Element | null>(null);

  const q = norm(query);
  const matches = useMemo(
    () => (q ? items.filter(i => norm(i.text).includes(q)) : []),
    [items, q],
  );

  /**
   * Запрос меняем СИНХРОННО с уведомлением хозяина (React 18 батчит оба
   * обновления): если хозяин на запрос раскрывает свёрнутые группы (ChecklistTab),
   * строки совпадений уже в DOM к моменту, когда эффект прокрутки ищет
   * `data-search-id` — иначе первый проход прокрутки промахивается.
   */
  const changeQuery = (v: string) => {
    setQuery(v);
    onQueryChange?.(v);
  };

  /** Подсветить + прокрутить к центру + сфокусировать строку совпадения. */
  const goTo = (idx: number) => {
    if (matches.length === 0) return;
    const next = ((idx % matches.length) + matches.length) % matches.length;
    setActive(next);
    const root: ParentNode = scope?.current ?? document;
    const el = root.querySelector(`[data-search-id="${matches[next].id}"]`);
    if (!el) return;
    if (hitRef.current && hitRef.current !== el) {
      hitRef.current.classList.remove('search-hit');
      hitRef.current.removeAttribute('data-search-hit');
    }
    el.classList.add('search-hit');
    el.setAttribute('data-search-hit', '');
    hitRef.current = el;
    el.scrollIntoView({ block: 'center' });
    // BUG-004: фокус НЕ переносим на строку — владелец допечатывает уточнение
    // в поле поиска; озвучка совпадений — aria-live на счётчике.
  };

  // Ввод (или смена списка) — первое совпадение; пусто — снять подсветку
  useEffect(() => {
    if (!q || matches.length === 0) {
      if (hitRef.current) {
        hitRef.current.classList.remove('search-hit');
        hitRef.current.removeAttribute('data-search-hit');
        hitRef.current = null;
      }
      setActive(0);
      return;
    }
    goTo(0);
  }, [q, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      goTo(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      goTo(active - 1);
    } else if (e.key === 'Escape') {
      changeQuery('');
    }
  };

  const noMatch = q.length > 0 && matches.length === 0;

  return (
    <div className={`list-search ${className}`.trim()} data-testid={testId}>
      <Search size={15} aria-hidden style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <input
        type="text"
        role="searchbox"
        value={query}
        onChange={e => changeQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-testid={`${testId}-input`}
        className="list-search__input"
        style={noMatch ? { borderColor: 'var(--danger, #ef4444)' } : undefined}
      />
      {q && matches.length > 0 && (
        <span
          className="keep-num cap"
          data-testid={`${testId}-count`}
          aria-live="polite"
          style={{ color: 'var(--text-3)', flexShrink: 0 }}
        >
          {active + 1}/{matches.length}
        </span>
      )}
      {noMatch && (
        <span
          className="cap"
          role="status"
          data-testid={`${testId}-none`}
          style={{ color: 'var(--danger, #ef4444)', flexShrink: 0 }}
        >
          Не найдено
        </span>
      )}
      {query && (
        <button
          type="button"
          onClick={() => changeQuery('')}
          aria-label="Очистить поиск"
          data-testid={`${testId}-clear`}
          className="icon-action p-1 rounded shrink-0"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default ListSearch;
