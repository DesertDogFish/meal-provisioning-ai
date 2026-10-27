/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageLoader from './PageLoader';

/**
 * Fix-10 (п.4/5): брендовый лоаджер — префлоадер design-pack (парус, SMIL)
 * вместо голой надписи «Загрузка…». Единая точка: Suspense-фолбэк ленивых
 * роутов, состояния загрузки страниц, ProtectedRoute.
 */
describe('PageLoader — брендовая загрузка страниц (Fix-10 п.4/5)', () => {
  it('рендерит статус с префлоадером дизайн-кода и подписью по умолчанию', () => {
    render(<PageLoader />);
    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('Загружаем');
    const img = status.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toContain('preloader');
    expect(img!.getAttribute('alt')).toBe(''); // декоративен — статус озвучивает текст
  });

  it('подпись кастомизируется (например, «Проверяем сессию…»)', () => {
    render(<PageLoader label="Проверяем сессию…" />);
    expect(screen.getByRole('status').textContent).toContain('Проверяем сессию');
  });

  it('testid для e2e/компонентных проверок', () => {
    render(<PageLoader />);
    expect(screen.getByTestId('page-loader')).toBeTruthy();
  });
});
