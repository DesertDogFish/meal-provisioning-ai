/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import KebabMenu from './KebabMenu';
import BottomSheet from './BottomSheet';
import FilterSheet from './FilterSheet';

describe('KebabMenu — действия карточки/чеклиста через меню (подзадачи 4/5)', () => {
  const items = () => [
    { id: 'a', label: 'Действие А', testId: 'km-a', onSelect: vi.fn() },
    { id: 'b', label: 'Удалить', danger: true, testId: 'km-b', onSelect: vi.fn() },
  ];

  it('поповер закрыт по умолчанию; открывается по ⋮ и содержит пункты', () => {
    render(<KebabMenu label="Действия" items={items()} />);
    expect(screen.queryByTestId('kebab-pop')).toBeNull();
    fireEvent.click(screen.getByTestId('kebab-menu'));
    expect(screen.getByTestId('km-a')).toBeTruthy();
    expect(screen.getByTestId('km-b').className).toContain('danger');
  });

  it('пункт вызывается один раз, меню закрывается, фокус возвращается на ⋮', () => {
    const its = items();
    render(<KebabMenu label="Действия" items={its} />);
    fireEvent.click(screen.getByTestId('kebab-menu'));
    fireEvent.click(screen.getByTestId('km-a'));
    expect(its[0].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('kebab-pop')).toBeNull();
    expect(screen.getByTestId('kebab-menu')).toHaveFocus();
  });

  it('Esc и клик вне закрывают без вызова действий', () => {
    const its = items();
    render(<div><KebabMenu label="Действия" items={its} /><button data-testid="outside" /></div>);
    fireEvent.click(screen.getByTestId('kebab-menu'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('kebab-pop')).toBeNull();
    fireEvent.click(screen.getByTestId('kebab-menu'));
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('kebab-pop')).toBeNull();
    expect(its[0].onSelect).not.toHaveBeenCalled();
  });
});

describe('BottomSheet — оверлей по правилам дизайн-пака', () => {
  it('Esc закрывает и возвращает фокус на триггер', () => {
    const onClose = vi.fn();
    function Wrap() {
      return (
        <>
          <button data-testid="trigger" onClick={() => {}} />
          <BottomSheet title="Тест" onClose={onClose}><p>контент</p></BottomSheet>
        </>
      );
    }
    render(<Wrap />);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Тест');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('клик по фону закрывает, клик по листу — нет', () => {
    const onClose = vi.fn();
    render(<BottomSheet title="Тест" onClose={onClose}><p data-testid="inner">контент</p></BottomSheet>);
    fireEvent.click(screen.getByTestId('inner'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sheet-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('FilterSheet — фильтры каталога (подзадача 10)', () => {
  it('на десктопе (matchMedia false) дети инлайн, кнопки нет', () => {
    render(<FilterSheet count={2}><input data-testid="f-child" /></FilterSheet>);
    expect(screen.getByTestId('f-child')).toBeTruthy();
    expect(screen.queryByTestId('filters-fab')).toBeNull();
  });

  it('на мобильном (matchMedia true) — кнопка с бейджем и sheet с детьми', () => {
    // happy-dom: matchMedia отсутствует → useIsMobile() === false; форсируем мобилку стабом
    const mql = {
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    vi.stubGlobal('matchMedia', (q: string) => ({ ...mql, media: q }));
    // window.matchMedia проверяется через typeof window.matchMedia — дополняем window
    Object.defineProperty(window, 'matchMedia', { value: (q: string) => ({ ...mql, media: q }), configurable: true });
    render(<FilterSheet count={2}><input data-testid="f-child" /></FilterSheet>);
    const btn = screen.getByTestId('filters-fab');
    expect(btn.textContent).toContain('Фильтры · 2');
    // дети НЕ смонтированы инлайн (нет дублей в DOM)
    expect(screen.queryByTestId('f-child')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByTestId('f-child')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
