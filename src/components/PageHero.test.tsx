/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PageHero from './PageHero';

/**
 * BUG-002 (tasks/bugs-page-headers.md п.2): hero-шапка основных страниц —
 * скруглённый блок с ненавязчивым арт-слоем (паттерн glass-шапки похода):
 * заголовок + подпись слева, действия справа; декор aria-hidden.
 */
describe('PageHero — BUG-002', () => {
  it('рендерит заголовок, подпись и действия внутри hero-блока', () => {
    render(
      <PageHero
        title="Блюда"
        subtitle="201 блюдо · 9 категорий"
        right={<button type="button">Создать</button>}
      />,
    );
    const hero = screen.getByTestId('page-hero');
    expect(hero).toContainElement(screen.getByRole('heading', { level: 1, name: 'Блюда' }));
    expect(hero.textContent).toContain('201 блюдо · 9 категорий');
    expect(hero).toContainElement(screen.getByRole('button', { name: 'Создать' }));
  });

  it('арт-слой декоративный: .page-hero__art c aria-hidden, без текста', () => {
    render(<PageHero title="Походы" />);
    const hero = screen.getByTestId('page-hero');
    const art = hero.querySelector('.page-hero__art');
    expect(art).toBeTruthy();
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(art?.textContent).toBe('');
    // без подписи — <p> не рендерится
    expect(hero.querySelector('p')).toBeNull();
  });
});
