import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { computeDropdownPosition } from '../utils/dropdownPos';

/**
 * Fix-5 (п.3–5): «На 1 чел. (общее)»?? — у каждого неочевидного числа должна быть
 * подсказка с формулой.
 *
 * Подзадача 3 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): нативный `title` на
 * тач-устройстве недоступен ВОВСЕ (нет ховера) — подсказки с формулами на телефоне
 * не читались. Теперь это управляемый поповер в портале document.body:
 *  - открытие: клик/тап, фокус с клавиатуры, ховер на устройствах с мышью;
 *  - закрытие: Esc, клик вне, уход фокуса/курсора; фокус возвращается на триггер;
 *  - позиция — `position: fixed` по расчёту `dropdownPos.ts` (не вылезает за вьюпорт
 *    ни на 360px, ни у правого края таблицы), слой `--z-pop`;
 *  - a11y: `role="tooltip"` + `aria-describedby` на триггере, `aria-expanded`;
 *  - тач-таргет иконки ≥44×44px — «перчаточная» зона в CSS (.infotip-trigger::after).
 * Нативный `title` НЕ возвращаем: браузер рисовал бы второй тултип поверх поповера.
 */
export interface InfoTipProps {
  /** Текст подсказки — человеческим языком, с формулой и примером, если уместно */
  text: string;
  /** Дополнительный aria-label (по умолчанию из text) */
  label?: string;
}

/** Ховер-подсказки — только там, где реально есть курсор (иначе тап дважды тоглит). */
function hasFinePointer(): boolean {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

/** Жёсткий максимум ширины поповера (план, подзадача 3): ≤ min(320px, 90vw). */
const POP_MAX_WIDTH = 320;
/** Ограничение высоты — чтобы длинная формула скроллилась внутри, а не резалась. */
const POP_MAX_HEIGHT = 240;

export function InfoTip({ text, label }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxWidth: number; maxHeight: number } | null>(null);
  /** Триггер внутри модалки? Её слой --z-modal (90) выше --z-pop (40), а поповер
      рендерится порталом в body — без подъёма слоя он оказался бы ПОД затемнением. */
  const [aboveModal, setAboveModal] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const byHover = useRef(false);
  /** Момент, когда поповер открыл ФОКУС. На тач-устройстве порядок событий
      `mousedown → focus → mouseup → click`: фокус успевает открыть поповер,
      а догнавший его click — тут же закрыть (подсказка «не открывается»).
      Клик в пределах этого окна игнорируем: поповер остаётся открытым. */
  const focusOpenedAt = useRef(0);
  const popId = useId();
  const ariaLabel = label ?? text;

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAboveModal(el.closest('.modal-overlay') != null);
    // visualViewport — на телефоне layout-вьюпорт может быть шире видимого
    // (при переполнении страницы), и поповер уехал бы за правый край экрана.
    const vv = window.visualViewport;
    const p = computeDropdownPosition(
      { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
      { width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight },
      { gap: 6, margin: 8, listHeight: POP_MAX_HEIGHT, minSide: 96, maxWidth: POP_MAX_WIDTH },
    );
    setPos({ top: p.top, left: p.left, maxWidth: p.maxWidth, maxHeight: p.maxHeight });
  }, []);

  const openPop = useCallback((hover: boolean) => {
    byHover.current = hover;
    setOpen(true);
    measure();
  }, [measure]);

  const closePop = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    byHover.current = false;
    if (restoreFocus && document.activeElement === popRef.current) {
      triggerRef.current?.focus();
    }
  }, []);

  // Esc закрывает верхний оверлей (жёсткое правило дизайн-пака) + клик вне.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closePop(true);
      triggerRef.current?.focus();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      closePop(false);
    };
    // Пересчёт при скролле/ресайзе: поповер фиксирован к вьюпорту, триггер — нет.
    const onMove = () => measure();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, closePop, measure]);

  const fine = hasFinePointer();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="infotip-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-describedby={open ? popId : undefined}
        data-testid="info-tip"
        onClick={() => {
          if (open && Date.now() - focusOpenedAt.current < 350) return; // клик «догнал» фокус
          if (open) closePop(false); else openPop(false);
        }}
        onFocus={() => {
          if (open) return;
          focusOpenedAt.current = Date.now();
          openPop(false);
        }}
        onBlur={() => { if (open && !byHover.current) closePop(false); }}
        onMouseEnter={fine ? () => { if (!open) openPop(true); } : undefined}
        onMouseLeave={fine ? () => { if (open && byHover.current) closePop(false); } : undefined}
      >
        <HelpCircle size={13} aria-hidden />
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          id={popId}
          role="tooltip"
          className="infotip-pop"
          data-testid="info-tip-pop"
          style={{
            top: pos.top,
            left: pos.left,
            maxWidth: pos.maxWidth,
            maxHeight: pos.maxHeight,
            overflowY: 'auto',
            zIndex: aboveModal ? 'calc(var(--z-modal) + 1)' : undefined,
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}

export default InfoTip;
