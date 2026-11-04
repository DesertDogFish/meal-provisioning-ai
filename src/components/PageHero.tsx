import type { ReactNode } from 'react';

import headerArt from '../assets/atmosphere/camp-ready.webp';

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
  return (
    <div className="page-hero" data-testid={testId}>
      <div
        className="page-hero__art"
        aria-hidden
        style={{ backgroundImage: `url(${headerArt})` }}
      />
      <div className="page-hero__in flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>
            {title}
          </h1>
          {subtitle != null && (
            <p className="mt-1" style={{ color: 'var(--muted)' }}>{subtitle}</p>
          )}
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
    </div>
  );
}

export default PageHero;
