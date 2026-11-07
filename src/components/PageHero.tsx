import { useEffect, useRef, type ReactNode } from 'react';

import headerArt from '../assets/atmosphere/camp-ready.webp';
import { AppMenuButton } from './AppMenuButton';

/**
 * BUG-002 (tasks/bugs-page-headers.md п.2, решение владельца 03.11.2026):
 * единая hero-шапка основных страниц («Походы», «Блюда», «Продукты»):
 * заголовок + подпись слева, действия справа; весь блок — скруглённая карточка
 * с ненавязчивым арт-слоем по образцу glass-шапки похода (design-п.5,
 * `.trip-header-glass` в index.css). Арт — СУЩЕСТВУЮЩИЙ (camp-ready.webp),
 * новых бинарников не заводим; слои декора aria-hidden + pointer-events:none,
 * анимаций нет (prefers-reduced-motion не нужен), печать без арта (index.css).
 * R8: один компонент на три страницы, без дублей вёрстки.
 */
export interface PageHeroProps {
  title: string;
  /** строка под заголовком (счётчики/пояснение); текст или ноды */
  subtitle?: ReactNode;
  /** действия справа (иконные кнопки и т.п.) */
  right?: ReactNode;
  testId?: string;
}

export function PageHero({ title, subtitle, right, testId = 'page-hero' }: PageHeroProps) {
  // UX-список владельца п.25: фильтры липнут сразу под шапкой — её фактическую высоту
  // отдаём в CSS-переменную (высота зависит от наличия подписи и инсета устройства).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => document.documentElement.style.setProperty('--hero-sticky-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="page-hero" data-testid={testId} ref={rootRef}>
      <div
        className="page-hero__art"
        aria-hidden
        style={{ backgroundImage: `url(${headerArt})` }}
      />
      <div className="page-hero__in">
        {/* UX-список владельца: кнопка меню — размером с заголовок, подзаголовок
            начинается под кнопкой (на всю ширину), а не под заголовком. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <AppMenuButton />
            <h1 className="text-2xl md:text-3xl font-bold truncate" style={{ color: 'var(--text)' }}>
              {title}
            </h1>
          </div>
          {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
        </div>
        {subtitle != null && (
          <p className="mt-1" style={{ color: 'var(--muted)' }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default PageHero;
