/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Fix-8 (п.1): «почему кнопка создать без обводки и цвета» — у кнопок с
 * пустым style={{}} пропали фон/обводка/цвет. В ErrorBoundary кнопка
 * «Попробовать снова» была такой же «голой»: возвращены фирменные токены
 * (градиент, цвет текста, обводка, glow), контент центрирован (justify-center).
 *
 * Симуляция реального краша детей нестабильна в happy-dom (React 18
 * invokeGuardedCallbackDev пробрасывает ошибку сквозь env), поэтому fallback
 * рендерится детерминированно: renderToStaticMarkup с установленным state
 * границы (hasError + error) — это ровно то, что рисует render() при ошибке.
 */
describe('ErrorBoundary — кнопка восстановления (Fix-8 п.1)', () => {
  it('«Попробовать снова» — не «голая»: фирменный градиент, цвет, обводка, центрирование', () => {
    const boundary = new ErrorBoundary({ children: null });
    // внутреннее состояние после componentDidCatch (fallback-ветка render())
    (boundary as unknown as { state: unknown }).state = {
      hasError: true,
      error: { type: 'internal-error', title: 'Что-то пошло не так', detail: 'test' },
    };
    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const btn = Array.from(doc.querySelectorAll('button')).find(b =>
      (b.textContent ?? '').includes('Попробовать снова'),
    );
    expect(btn).toBeTruthy();
    const style = btn!.getAttribute('style') ?? '';
    expect(style).toContain('var(--grad-brand)');
    expect(style).toContain('var(--on-fire)');
    expect(style).toContain('border');
    expect(btn!.className).toContain('justify-center');
  });
});
