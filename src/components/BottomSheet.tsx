import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { lockBodyScroll, unlockBodyScroll } from './Modal';

/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадачи 1/5/9/10): нижний
 * sheet-оверлей — сводка похода из компактной полосы, выбор единиц UnitChip,
 * фильтры каталогов. Правила дизайн-пака те же, что у модалок: Esc закрывает
 * верхний оверлей, клик вне закрывает, фокус возвращается на триггер,
 * тач-таргеты ≥44px, `prefers-reduced-motion` учитывается в CSS (.sheet).
 *
 * Блокировка скролла фона — общая с <Modal> (счётчик lockBodyScroll): sheet
 * поверх модалки или ConfirmDialog поверх sheet не разблокируют body раньше
 * времени.
 */
export interface BottomSheetProps {
  /** заголовок sheet (a11y-имя диалога) */
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId?: string;
}

export function BottomSheet({ title, onClose, children, testId }: BottomSheetProps) {
  // фокус возвращается на триггер: запоминаем элемент, открывший sheet
  const restoreTo = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    lockBodyScroll();
    // фокус внутрь диалога: Esc/Tab живут в диалоге, а не на фоне
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      unlockBodyScroll();
      restoreTo.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className="sheet-overlay"
      data-testid={testId ? `${testId}-overlay` : 'sheet-overlay'}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId ?? 'sheet'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__grab" aria-hidden />
        <p className="sheet__title">{title}</p>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default BottomSheet;
