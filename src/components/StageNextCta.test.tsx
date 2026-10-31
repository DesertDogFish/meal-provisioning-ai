/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { StageNextCta } from './StageNextCta';
import type { StageId } from './StageTabBar';

/**
 * План plans/2026-10-31-ux-audit-navigation.md (п.2): CTA «Далее» в конце
 * каждого этапа. Готовый этап — кнопка следующего шага (④ — отчёт /report);
 * незаполненный этап — подсказка вместо кнопки (критерий: «CTA скрыт/заменён
 * подсказкой»).
 */

const ALL_DONE: Record<StageId, boolean> = { menu: true, shopping: true, store: true, checks: true };
const NONE_DONE: Record<StageId, boolean> = { menu: false, shopping: false, store: false, checks: false };

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderCta(stage: StageId, done: Record<StageId, boolean>) {
  const onStage = vi.fn();
  const { unmount } = render(
    <MemoryRouter initialEntries={[`/trips/t1?stage=${stage}`]}>
      <Routes>
        <Route path="/trips/:id" element={<><StageNextCta tripId="t1" stage={stage} done={done} onStage={onStage} /><LocationProbe /></>} />
        <Route path="/trips/:id/report" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
  return { onStage, unmount };
}

describe('StageNextCta (navigation-п.2)', () => {
  it('① готово → «К закупке ②» меняет stage', () => {
    const { onStage } = renderCta('menu', ALL_DONE);
    expect(screen.getByTestId('stage-next-cta').textContent).toContain('К закупке');
    fireEvent.click(screen.getByTestId('stage-next-cta'));
    expect(onStage).toHaveBeenCalledWith('shopping');
  });

  it('② готово → «К списку в магазине ③»; ③ готово → «Ввести чеки ④»', () => {
    const first = renderCta('shopping', ALL_DONE);
    expect(screen.getByTestId('stage-next-cta').textContent).toContain('магазине');
    fireEvent.click(screen.getByTestId('stage-next-cta'));
    expect(first.onStage).toHaveBeenCalledWith('store');
    first.unmount();

    renderCta('store', ALL_DONE);
    expect(screen.getByTestId('stage-next-cta').textContent).toContain('чеки');
  });

  it('④ готово → «Отчёт и поделиться» ведёт на /trips/t1/report', () => {
    renderCta('checks', ALL_DONE);
    fireEvent.click(screen.getByTestId('stage-next-cta'));
    expect(screen.getByTestId('loc').textContent).toBe('/trips/t1/report');
  });

  it('незаполненный этап — подсказка вместо кнопки (на каждом этапе)', () => {
    for (const stage of ['menu', 'shopping', 'store', 'checks'] as StageId[]) {
      const { unmount } = renderCta(stage, NONE_DONE);
      expect(screen.queryByTestId('stage-next-cta')).toBeNull();
      expect(screen.getByTestId(`stage-next-hint-${stage}`).textContent!.length).toBeGreaterThan(10);
      unmount();
    }
  });
});
