import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * FIX (модалки «уезжают вниз»): раньше .modal-overlay рендерился внутри
 * <main className="... overflow-auto"> в Layout. У элемента с overflow:auto
 * создаётся собственный scroll-контейнер, и position:fixed внутри него
 * позиционируется не по окну браузера, а по этому контейнеру. На длинных
 * страницах (каталог блюд, продукты) контейнер растягивается на всю высоту
 * контента, и центрированная модалка оказывалась посередине прокрутки —
 * визуально «внизу». Решение: портал в document.body + overflow-y:auto на
 * оверлее, чтобы высокая модалка скроллилась сама, а не уезжала за экран.
 */

/**
 * Fix-7 (п.1): пока открыта модалка, фон НЕ скроллится. Счётчик — на случай
 * вложенных оверлеев (ConfirmDialog поверх модалки состава): body разблокируется,
 * только когда закроется последний. paddingRight компенсирует исчезнувший
 * скроллбар, чтобы контент не «прыгал» вбок.
 */
let lockCount = 0;
let prevOverflow = '';
let prevPaddingRight = '';

export function lockBodyScroll(): void {
  if (lockCount === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    prevOverflow = document.body.style.overflow;
    prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  lockCount += 1;
}

export function unlockBodyScroll(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = prevOverflow;
    document.body.style.paddingRight = prevPaddingRight;
  }
}

/** Количество активных блокировок — для тестов. */
export function bodyScrollLockCount(): number {
  return lockCount;
}

export default function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  /** Вызывается при клике по затемнённому фону и по Escape. */
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fix-7 (п.1): блокировка скролла фона на всё время жизни оверлея
  useEffect(() => {
    lockBodyScroll();
    return unlockBodyScroll;
  }, []);

  return createPortal(
    <div
      className="modal-overlay"
      data-testid="modal-overlay"
      onClick={onClose}
    >
      {/* Клик по самой карточке не должен закрывать окно (прежнее поведение).
          Подзадача 4 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): обёртка
          .modal-wrap держит ограничение высоты по dvh — лист модалки
          скроллится ВНУТРИ и целиком влезает в экран телефона, а оверлей
          больше не скроллится (overflow-y:auto убран: он и был причиной
          «модалка не по центру, а где-то сбоку/снизу»). */}
      <div className="modal-wrap" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  );
}
