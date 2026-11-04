/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import ListSearch from './ListSearch';

/**
 * bugs-trip-checks-stage п.7: общий контрол липкого поиска (чеклист ③ и чек ④).
 * Интеграции проверены в ChecklistTab.test.tsx / ChecksMobile.test.tsx; здесь —
 * ветки, до которых интеграции не доходят: стрелки, Escape, очистка, scope.
 */
const ITEMS = [
  { id: 'a', text: 'Гречка' },
  { id: 'b', text: 'Тушёнка' },
  { id: 'c', text: 'Гречишный мёд' },
];

function Rows({ ids = ['a', 'b', 'c'] }: { ids?: string[] }) {
  return (
    <div>
      {ids.map(id => <div key={id} data-search-id={id}>row {id}</div>)}
    </div>
  );
}

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe('ListSearch — bugs-trip-checks-stage п.7', () => {
  it('ввод: первое совпадение — .search-hit + scrollIntoView(center) + счётчик', () => {
    render(<><ListSearch items={ITEMS} testId="ls" /><Rows /></>);
    fireEvent.change(screen.getByTestId('ls-input'), { target: { value: 'греч' } });
    const hit = document.querySelector('[data-search-id="a"]')!;
    expect(hit.classList.contains('search-hit')).toBe(true);
    expect(hit.getAttribute('data-search-hit')).toBe('');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(screen.getByTestId('ls-count').textContent).toBe('1/2');
  });

  it('Enter/ArrowDown — следующее совпадение (по кругу), ArrowUp — назад', () => {
    render(<><ListSearch items={ITEMS} testId="ls" /><Rows /></>);
    const input = screen.getByTestId('ls-input');
    fireEvent.change(input, { target: { value: 'греч' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.querySelector('[data-search-id="c"]')!.classList.contains('search-hit')).toBe(true);
    expect(document.querySelector('[data-search-id="a"]')!.classList.contains('search-hit')).toBe(false);
    expect(screen.getByTestId('ls-count').textContent).toBe('2/2');
    // по кругу
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.querySelector('[data-search-id="a"]')!.classList.contains('search-hit')).toBe(true);
    // назад
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(document.querySelector('[data-search-id="c"]')!.classList.contains('search-hit')).toBe(true);
  });

  it('промах — «Не найдено» (role=status); очистка/Escape снимают подсветку', () => {
    render(<><ListSearch items={ITEMS} testId="ls" /><Rows /></>);
    const input = screen.getByTestId('ls-input');
    fireEvent.change(input, { target: { value: 'греч' } });
    expect(document.querySelector('[data-search-id="a"]')!.classList.contains('search-hit')).toBe(true);

    fireEvent.change(input, { target: { value: 'xyzzz' } });
    const none = screen.getByTestId('ls-none');
    expect(none.textContent).toBe('Не найдено');
    expect(none.getAttribute('role')).toBe('status');
    expect(document.querySelector('.search-hit')).toBeNull();

    fireEvent.change(input, { target: { value: 'туш' } });
    expect(document.querySelector('[data-search-id="b"]')!.classList.contains('search-hit')).toBe(true);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.querySelector('.search-hit')).toBeNull();

    // кнопка очистки
    fireEvent.change(input, { target: { value: 'туш' } });
    fireEvent.click(screen.getByTestId('ls-clear'));
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.querySelector('.search-hit')).toBeNull();
  });

  it('scope: совпадения ищутся только внутри контейнера хозяина', () => {
    const scope = createRef<HTMLDivElement>();
    render(
      <>
        <ListSearch items={ITEMS} testId="ls" scope={scope} />
        {/* «чужая» копия строки с тем же id — вне scope (например, скрытый
            мобильный дубль таблицы); поиск не должен её подсвечивать */}
        <div data-search-id="a">дубль</div>
        <div ref={scope}><Rows ids={['a']} /></div>
      </>,
    );
    fireEvent.change(screen.getByTestId('ls-input'), { target: { value: 'греч' } });
    const hits = document.querySelectorAll('[data-search-id="a"].search-hit');
    expect(hits).toHaveLength(1);
    expect(hits[0].textContent).toBe('row a');
  });

  it('onQueryChange получает каждый запрос (хозяин раскрывает группы)', () => {
    const onQueryChange = vi.fn();
    render(<ListSearch items={ITEMS} testId="ls" onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByTestId('ls-input'), { target: { value: 'г' } });
    expect(onQueryChange).toHaveBeenLastCalledWith('г');
  });

  it('«ё» = «е»: запрос «тушен» находит «Тушёнка»', () => {
    render(<><ListSearch items={ITEMS} testId="ls" /><Rows /></>);
    fireEvent.change(screen.getByTestId('ls-input'), { target: { value: 'тушен' } });
    expect(screen.getByTestId('ls-count').textContent).toBe('1/1');
  });
});

// BUG-004 (tasks/bugs-list-search-focus.md п.1): ввод не уводит фокус из строки
// поиска — владелец должен мочь допечатать уточнение; подсветка/прокрутка остаются.
describe('ListSearch — BUG-004: фокус остаётся в поле ввода', () => {
  it('ввод: activeElement = input (не строка), .search-hit и прокрутка на месте', () => {
    render(<><ListSearch items={ITEMS} testId="ls" /><Rows /></>);
    const input = screen.getByTestId('ls-input');
    input.focus();
    fireEvent.change(input, { target: { value: 'греч' } });
    expect(document.activeElement).toBe(input);
    const hit = document.querySelector('[data-search-id="a"]')!;
    expect(hit.classList.contains('search-hit')).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    // строка не получает фокусируемой обвязки tabindex
    expect(hit.getAttribute('tabindex')).toBeNull();
  });

  it('перебор Enter/стрелками тоже не уводит фокус из input', () => {
    render(<><ListSearch items={ITEMS} testId="ls" /><Rows /></>);
    const input = screen.getByTestId('ls-input');
    input.focus();
    fireEvent.change(input, { target: { value: 'греч' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId('ls-count').textContent).toBe('2/2');
  });
});
