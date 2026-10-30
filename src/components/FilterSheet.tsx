import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Button } from './Button';

/** useSyncExternalStore-простая подписка на matchMedia: дети FilterSheet
 * монтируются РОНО один раз — инлайн на десктопе ИЛИ в sheet на мобильном
 * (дублей в DOM нет, тесты getByTestId не ловят скрытую копию). */
export function useIsMobile(query = '(max-width: 767px)'): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return isMobile;
}

/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 10): строка фильтров
 * каталогов на телефоне = поиск + кнопка «Фильтры (N)»; все селекты и чипы
 * уезжают в bottom-sheet (правила оверлея — Esc/клик вне/возврат фокуса,
 * цели ≥44px). На десктопе дети рендерятся инлайн, как прежде.
 *
 * `count` — число активных фильтров (бейдж на кнопке), чтобы было видно,
 * что список отфильтрован, не раскрывая sheet.
 */
export interface FilterSheetProps {
  /** число активных фильтров (0 — бейдж не показывается) */
  count: number;
  /** содержимое фильтров: на мобильном — в sheet, на десктопе — инлайн */
  children: React.ReactNode;
  testId?: string;
}

export function FilterSheet({ count, children, testId }: FilterSheetProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  return (
    <>
      {!isMobile && <div className="filters-bar-inline contents">{children}</div>}
      {isMobile && (
        <>
          <Button
            variant="soft"
            icon={<SlidersHorizontal size={15} />}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-testid={testId ?? 'filters-fab'}
            onClick={() => setOpen(true)}
          >
            Фильтры{count > 0 ? ` · ${count}` : ''}
          </Button>
          {open && (
            <BottomSheet title="Фильтры" onClose={() => setOpen(false)} testId={testId ? `${testId}-sheet` : 'filters-sheet'}>
              <div className="space-y-3">{children}</div>
            </BottomSheet>
          )}
        </>
      )}
    </>
  );
}

export default FilterSheet;
