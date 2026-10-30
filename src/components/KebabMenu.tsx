import { useEffect, useId, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадачи 4/5): kebab-меню
 * действий (⋮) — правка/удаление похода с карточки, «Снять всё» чеклиста.
 * Случайное опасное действие невозможно: удаление живёт только в меню.
 *
 * Поведение оверлея — по правилам дизайн-пака: Esc и клик вне закрывают,
 * фокус возвращается на кнопку ⋮, тач-таргеты пунктов ≥44px (CSS .kebab-pop).
 */
export interface KebabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  testId?: string;
  onSelect: () => void;
}

export interface KebabMenuProps {
  /** a11y-имя кнопки ⋮ («Действия с походом …») */
  label: string;
  items: KebabItem[];
  testId?: string;
}

export function KebabMenu({ label, items, testId }: KebabMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // поповер прижимается к правому краю кнопки и не вылезает за экран
    const width = 200;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const top = Math.min(r.bottom + 6, window.innerHeight - 8 - items.length * 48 - 8);
    setPos({ top: Math.max(8, top), left });
  }, [open, items.length]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="ibtn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        data-testid={testId ?? 'kebab-menu'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical size={18} />
      </button>
      {open && pos && (
        <div
          ref={popRef}
          id={popId}
          className="kebab-pop"
          role="menu"
          aria-label={label}
          style={{ top: pos.top, left: pos.left }}
          data-testid={testId ? `${testId}-pop` : 'kebab-pop'}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              className={it.danger ? 'danger' : undefined}
              data-testid={it.testId}
              onClick={() => {
                setOpen(false);
                btnRef.current?.focus();
                it.onSelect();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default KebabMenu;
