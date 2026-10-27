/**
 * Fix-7 (п.12/14): позиционирование выпадающих списков в ПОРТАЛЕ (position:fixed).
 *
 * Проблема: дропдаун, отрисованный в потоке модалки с overflow:auto, расширяет
 * её контент и заставляет модалку скроллиться («Категория вызывает скролл»);
 * узкий триггер ограничивает ширину списка («в категории горизонтальная прокрутка»).
 *
 * Решение: список рендерится в document.body с координатами от rect триггера.
 * Расчёт — чистая функция (тестируемо без DOM):
 *  - вниз, если снизу достаточно места; иначе вверх (openUp);
 *  - maxHeight — по доступному месту (не вылезает за вьюпорт);
 *  - left прижат к границе вьюпорта (margin), minWidth — ширина триггера
 *    (визуальная привязка), фактическую ширину задаёт CSS max-content ≤ maxWidth.
 */

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface DropdownPosition {
  /** top для position:fixed */
  top: number;
  /** left для position:fixed */
  left: number;
  /** минимум — ширина триггера (список не уже поля) */
  minWidth: number;
  /** максимум — чтобы не вылезал за вьюпорт */
  maxWidth: number;
  /** ограниченная высота (внутренний скролл списка) */
  maxHeight: number;
  /** список открывается вверх (не хватило места снизу) */
  openUp: boolean;
}

export interface DropdownPositionOptions {
  /** зазор между триггером и списком, px (default 4) */
  gap?: number;
  /** недопуск до края вьюпорта, px (default 8) */
  margin?: number;
  /** желаемая высота списка, px (default 280) */
  listHeight?: number;
  /** минимальная высота, при которой сторона считается пригодной, px (default 140) */
  minSide?: number;
  /** жёсткий максимум ширины, px (default 360) */
  maxWidth?: number;
}

export function computeDropdownPosition(
  anchor: AnchorRect,
  viewport: ViewportSize,
  opts: DropdownPositionOptions = {},
): DropdownPosition {
  const gap = opts.gap ?? 4;
  const margin = opts.margin ?? 8;
  const listHeight = opts.listHeight ?? 280;
  const minSide = opts.minSide ?? 140;
  const maxWidthCap = opts.maxWidth ?? 360;

  const spaceBelow = Math.max(0, viewport.height - anchor.bottom - gap - margin);
  const spaceAbove = Math.max(0, anchor.top - gap - margin);

  // Вверх — только если снизу тесно, а сверху просторнее
  const openUp = spaceBelow < Math.min(listHeight, minSide) && spaceAbove > spaceBelow;

  const available = openUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(80, Math.min(listHeight, available));

  const top = openUp
    ? Math.max(margin, anchor.top - gap - maxHeight)
    : anchor.bottom + gap;

  const maxWidth = Math.max(
    anchor.width,
    Math.min(maxWidthCap, viewport.width - margin * 2),
  );
  // список не вылезает за правый край
  const left = Math.max(
    margin,
    Math.min(anchor.left, viewport.width - margin - maxWidth),
  );

  return { top, left, minWidth: anchor.width, maxWidth, maxHeight, openUp };
}
