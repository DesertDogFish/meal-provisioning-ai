/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StageTabBar, parseStage, STAGES } from './StageTabBar';
import type { StageId } from './StageTabBar';

const done = (v: boolean): Record<StageId, boolean> => ({ menu: v, shopping: v, store: v, checks: v });

describe('StageTabBar — 4 этапа воркфлоу (подзадача 2, 30.10.2026)', () => {
  it('4 этапа в таб-баре и в степпере, активный помечен aria-current', () => {
    render(<StageTabBar stage="store" onStage={() => {}} done={done(false)} />);
    for (const s of STAGES) {
      expect(screen.getByTestId(`stage-bar-${s.id}`)).toBeTruthy();
      expect(screen.getByTestId(`stage-step-${s.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('stage-bar-store').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('stage-step-store').getAttribute('aria-current')).toBe('step');
  });

  it('тап по этапу зовёт onStage', () => {
    const onStage = vi.fn();
    render(<StageTabBar stage="menu" onStage={onStage} done={done(false)} />);
    fireEvent.click(screen.getByTestId('stage-bar-checks'));
    expect(onStage).toHaveBeenCalledWith('checks');
    fireEvent.click(screen.getByTestId('stage-step-shopping'));
    expect(onStage).toHaveBeenCalledWith('shopping');
  });

  it('готовый этап — галочка в бейдже и в степпере, не номер', () => {
    render(<StageTabBar stage="checks" onStage={() => {}} done={{ ...done(true), checks: false }} />);
    expect(screen.getByTestId('stage-bar-menu').textContent).toContain('✓');
    expect(screen.getByTestId('stage-bar-checks').textContent).toContain('4');
    expect(screen.getByTestId('stage-bar-checks').getAttribute('aria-label')).toContain('Этап 4');
  });

  it('parseStage: старые id вкладок и мусорные значения маппятся в этапы', () => {
    expect(parseStage('menu')).toBe('menu');
    expect(parseStage('dayShopping')).toBe('shopping');
    expect(parseStage('person')).toBe('shopping');
    expect(parseStage('checklist')).toBe('store');
    expect(parseStage('overrides')).toBe('checks');
    expect(parseStage(null)).toBe('menu');
    expect(parseStage('garbage')).toBe('menu');
  });
});
