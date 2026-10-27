/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ScrollTopButton from './ScrollTopButton';

describe('ScrollTopButton (Fix-7 п.9) — плавающая кнопка «наверх»', () => {
  const scrollToMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('scrollTo', scrollToMock);
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const setScrollY = (y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
    fireEvent.scroll(window);
  };

  it('у верха страницы — скрыта (без класса visible, aria-hidden)', () => {
    render(<ScrollTopButton />);
    const btn = screen.getByTestId('scroll-top');
    expect(btn.className).not.toContain('visible');
    expect(btn.getAttribute('aria-hidden')).toBe('true');
  });

  it('появляется, когда шапка скрыта (scrollY > 200), и исчезает у верха', () => {
    render(<ScrollTopButton />);
    const btn = screen.getByTestId('scroll-top');
    setScrollY(350);
    expect(btn.className).toContain('visible');
    expect(btn.getAttribute('aria-hidden')).toBe('false');
    setScrollY(50);
    expect(btn.className).not.toContain('visible');
  });

  it('порог настраивается', () => {
    render(<ScrollTopButton threshold={500} />);
    const btn = screen.getByTestId('scroll-top');
    setScrollY(300);
    expect(btn.className).not.toContain('visible');
    setScrollY(600);
    expect(btn.className).toContain('visible');
  });

  it('клик — плавный скролл наверх', () => {
    render(<ScrollTopButton />);
    fireEvent.click(screen.getByTestId('scroll-top'));
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
