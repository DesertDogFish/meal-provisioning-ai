/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StageTabBar, parseStage, STAGES } from './StageTabBar';
import type { StageId } from './StageTabBar';

const done = (v: boolean): Record<StageId, boolean> => ({ menu: v, shopping: v, store: v, checks: v, ready: v });

/**
 * UX-осмотр 31.10 (подзадача 5, KB-33): на мобильном было ТРИ интерактивных
 * переключателя этапов — верхний степпер, протёкший на mobile десктопный `.seg`
 * и нижний таб-бар (плюс чипы готовности в bottom-sheet). Единственная мобильная
 * навигация этапов — нижний `stage-bar`; верхний степпер удалён как дубль:
 * прогресс этапов уже показывают mini-steps липкой полосы и бейджи таб-бара.
 * Решение зафиксировано в DESIGN_MIGRATION.md (R11).
 */
describe('StageTabBar — 4 этапа воркфлоу (подзадача 2, 30.10.2026)', () => {
  it('4 этапа в таб-баре, активный помечен aria-current', () => {
    render(<StageTabBar stage="store" onStage={() => {}} done={done(false)} />);
    for (const s of STAGES) {
      expect(screen.getByTestId(`stage-bar-${s.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('stage-bar-store').getAttribute('aria-current')).toBe('page');
  });

  it('KB-33: степпера-дубля больше нет — ровно одна nav и 5 кнопок (redesign п.5: +⑤)', () => {
    const { container } = render(<StageTabBar stage="store" onStage={() => {}} done={done(false)} />);
    expect(screen.queryByTestId('stage-stepper')).toBeNull();
    expect(screen.queryByTestId('stage-step-menu')).toBeNull();
    expect(container.querySelectorAll('.stage-stepper')).toHaveLength(0);
    const navs = container.querySelectorAll('nav');
    expect(navs).toHaveLength(1);
    expect(navs[0].querySelectorAll('button')).toHaveLength(5);
  });

  it('тап по этапу зовёт onStage', () => {
    const onStage = vi.fn();
    render(<StageTabBar stage="menu" onStage={onStage} done={done(false)} />);
    fireEvent.click(screen.getByTestId('stage-bar-checks'));
    expect(onStage).toHaveBeenCalledWith('checks');
    fireEvent.click(screen.getByTestId('stage-bar-shopping'));
    expect(onStage).toHaveBeenCalledWith('shopping');
  });

  it('готовый этап — галочка в бейдже таб-бара, не номер', () => {
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

// trip-workflow-redesign п.1: этап ② переименован «Закупка» → «Проверка»
// (id/URL `shopping` НЕ меняются — только пользовательская подпись).
describe('StageTabBar — redesign п.1: этап ② «Проверка»', () => {
  it('STAGES: id shopping подписан «Проверка»; в таб-баре нет слова «Закупка»', () => {
    expect(STAGES.find(s => s.id === 'shopping')?.label).toBe('Проверка');
    render(<StageTabBar stage="shopping" onStage={() => {}} done={done(false)} />);
    expect(screen.queryByText('Закупка')).toBeNull();
    expect(screen.getByText('Проверка')).toBeTruthy();
  });
});

// trip-workflow-redesign п.5: пятый этап воркфлоу — ⑤ «Поход готов» (ready).
describe('StageTabBar — redesign п.5: пятый этап', () => {
  it('stage-bar содержит 5 этапов, ⑤ подписан «Поход готов»', () => {
    expect(STAGES).toHaveLength(5);
    render(<StageTabBar stage="ready" onStage={() => {}} done={{ menu: true, shopping: true, store: true, checks: true, ready: true }} />);
    expect(screen.getByTestId('stage-bar-ready').getAttribute('aria-label')).toContain('Поход готов');
    expect(screen.getByTestId('stage-bar-ready').getAttribute('aria-current')).toBe('page');
  });

  it('parseStage("ready") → ready; прежние маппинги сохранены', () => {
    expect(parseStage('ready')).toBe('ready');
    expect(parseStage('checklist')).toBe('store');
  });
});
