/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { StageNextCta } from './StageNextCta';
import type { StageId } from './StageTabBar';

/**
 * План plans/done/2026-10-31-ux-audit-navigation.md (п.2): CTA «Далее» в конце
 * каждого этапа. Готовый этап — кнопка следующего шага (④ — отчёт /report);
 * незаполненный этап — подсказка вместо кнопки (критерий: «CTA скрыт/заменён
 * подсказкой»).
 */

const ALL_DONE: Record<StageId, boolean> = { menu: true, shopping: true, store: true, checks: true, ready: true };
const NONE_DONE: Record<StageId, boolean> = { menu: false, shopping: false, store: false, checks: false, ready: false };

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
  it('① готово → «К проверке ②» меняет stage (redesign п.1)', () => {
    const { onStage } = renderCta('menu', ALL_DONE);
    expect(screen.getByTestId('stage-next-cta').textContent).toContain('К проверке');
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

  it('④ готово → «К отчёту ⑤» ведёт на этап ready (redesign п.5)', () => {
    const { onStage } = renderCta('checks', ALL_DONE);
    expect(screen.getByTestId('stage-next-cta').textContent).toContain('К отчёту ⑤');
    fireEvent.click(screen.getByTestId('stage-next-cta'));
    expect(onStage).toHaveBeenCalledWith('ready');
  });

  it('незаполненный этап — подсказка вместо кнопки (②③; ① до утверждения — кнопка, redesign п.4)', () => {
    for (const stage of ['shopping', 'store', 'checks'] as StageId[]) {
      const { unmount } = renderCta(stage, NONE_DONE);
      expect(screen.queryByTestId('stage-next-cta')).toBeNull();
      expect(screen.getByTestId(`stage-next-hint-${stage}`).textContent!.length).toBeGreaterThan(10);
      unmount();
    }
  });
});

// trip-workflow-redesign п.1: подписи CTA/подсказок без слова «Закупка».
describe('StageNextCta — redesign п.1', () => {
  it('① готово → CTA «К проверке ②»', () => {
    renderCta('menu', ALL_DONE);
    expect(screen.getByTestId('stage-next-cta').textContent).toContain('К проверке ②');
  });
});

// trip-workflow-redesign п.4: CTA этапа ① до утверждения меню — кнопка
// «Утвердить меню» (мутация), после — «К проверке ②».
describe('StageNextCta — redesign п.4: утверждение меню', () => {
  it('① не утверждено → кнопка «Утвердить меню», клик = onApproveMenu (не смена этапа)', () => {
    const onApproveMenu = vi.fn();
    const onStage = vi.fn();
    render(
      <MemoryRouter initialEntries={['/trips/t1?stage=menu']}>
        <Routes>
          <Route path="/trips/:id" element={<StageNextCta tripId="t1" stage="menu" done={NONE_DONE} onStage={onStage} onApproveMenu={onApproveMenu} />} />
        </Routes>
      </MemoryRouter>,
    );
    const btn = screen.getByTestId('stage-next-cta');
    expect(btn.textContent).toContain('Утвердить меню');
    fireEvent.click(btn);
    expect(onApproveMenu).toHaveBeenCalledTimes(1);
    expect(onStage).not.toHaveBeenCalled();
  });

  it('① утверждено (done.menu) → CTA «К проверке ②»', () => {
    renderCta('menu', { ...NONE_DONE, menu: true });
    expect(screen.getByTestId('stage-next-cta').textContent).toContain('К проверке ②');
  });
});
