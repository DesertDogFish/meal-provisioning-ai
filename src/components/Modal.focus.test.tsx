/// <reference types="vitest/globals" />
/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадачи 13 и 14).
 *
 * KB-29: модалка смещалась в момент фокуса — координатный клик «глотался»
 * (pointerdown на кнопке, pointerup уже в другом месте). Механизм: скролл-
 * контейнер листа (`.modal-wrap > *`, overflow-y:auto) прокручивался при
 * focus(), а браузерный focus по умолчанию делает scroll-into-view. Плюс
 * deep-link «В меню похода…» догружает каталог асинхронно — лист вырастал
 * уже ПОСЛЕ открытия, и центрированная модалка «съезжала» под курсором.
 *
 * Подзадача 14: клавиатурный контракт оверлеев из дизайн-пака —
 *  - фокус заходит внутрь диалога и НЕ выпускается под оверлей (Tab-цикл);
 *  - Esc закрывает только ВЕРХНИЙ оверлей (модалка поверх модалки, sheet
 *    поверх модалки);
 *  - после закрытия фокус возвращается на триггер;
 *  - программный фокус — без прокрутки (preventScroll), иначе получаем KB-29.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Modal from './Modal';
import BottomSheet from './BottomSheet';

afterEach(() => {
  document.body.innerHTML = '';
});

function sheet(label: string, children: React.ReactNode) {
  return (
    <div className="modal-sheet" role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </div>
  );
}

function twoButtons() {
  return (
    <>
      <button type="button" data-testid="first">Первый</button>
      <button type="button" data-testid="last">Последний</button>
    </>
  );
}

describe('Modal — фокус внутри диалога, без прокрутки (KB-29, п.13/14)', () => {
  it('при открытии фокус переводится в лист с preventScroll', () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    render(
      <Modal onClose={() => {}}>
        {sheet('Лист', <button type="button">Действие</button>)}
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog === document.activeElement || dialog.contains(document.activeElement)).toBe(true);
    const withPrevent = focusSpy.mock.calls
      .filter(c => (c[0] as FocusOptions | undefined)?.preventScroll === true);
    expect(withPrevent.length, 'focus() обязан вызываться с preventScroll').toBeGreaterThan(0);
    focusSpy.mockRestore();
  });

  it('не перехватывает фокус, если внутри уже есть autoFocus-элемент', () => {
    render(
      <Modal onClose={() => {}}>
        {sheet('Лист', <input aria-label="Поиск" autoFocus />)}
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Поиск'));
  });

  it('Tab не выпускает фокус под оверлей: с последнего элемента — на первый', () => {
    render(<Modal onClose={() => {}}>{sheet('Лист', twoButtons())}</Modal>);
    const last = screen.getByTestId('last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });

  it('Shift+Tab с первого элемента — на последний (цикл замкнут)', () => {
    render(<Modal onClose={() => {}}>{sheet('Лист', twoButtons())}</Modal>);
    const first = screen.getByTestId('first');
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId('last'));
  });

  it('после закрытия фокус возвращается на триггер', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Открыть';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <Modal onClose={() => {}}>{sheet('Лист', twoButtons())}</Modal>,
    );
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Оверлеи — Esc закрывает только верхний (дизайн-пак, п.14)', () => {
  it('модалка поверх модалки: Esc закрывает верхнюю, нижняя жива', () => {
    const lowerClose = vi.fn();
    const upperClose = vi.fn();
    render(
      <>
        <Modal onClose={lowerClose}>{sheet('Нижняя', twoButtons())}</Modal>
        <Modal onClose={upperClose}>{sheet('Верхняя', twoButtons())}</Modal>
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(upperClose).toHaveBeenCalledTimes(1);
    expect(lowerClose).not.toHaveBeenCalled();
  });

  it('sheet поверх модалки: Esc закрывает sheet, модалка остаётся', () => {
    const modalClose = vi.fn();
    const sheetClose = vi.fn();
    render(
      <>
        <Modal onClose={modalClose}>{sheet('Модалка', twoButtons())}</Modal>
        <BottomSheet title="Sheet" onClose={sheetClose} testId="test-sheet">
          <button type="button">Опция</button>
        </BottomSheet>
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sheetClose).toHaveBeenCalledTimes(1);
    expect(modalClose).not.toHaveBeenCalled();
  });

  it('после закрытия верхнего оверлея Esc доходит до нижнего', () => {
    const lowerClose = vi.fn();
    const upperClose = vi.fn();
    const { rerender } = render(
      <>
        <Modal onClose={lowerClose}>{sheet('Нижняя', twoButtons())}</Modal>
        <Modal onClose={upperClose}>{sheet('Верхняя', twoButtons())}</Modal>
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(upperClose).toHaveBeenCalledTimes(1);

    rerender(<Modal onClose={lowerClose}>{sheet('Нижняя', twoButtons())}</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(lowerClose).toHaveBeenCalledTimes(1);
  });
});

describe('BottomSheet — фокус без прокрутки и возврат на триггер (п.14)', () => {
  it('фокус в sheet с preventScroll, после закрытия — на триггере', () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    const trigger = document.createElement('button');
    trigger.textContent = 'Открыть sheet';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <BottomSheet title="Сводка" onClose={() => {}} testId="kpi-sheet">
        <button type="button">Опция</button>
      </BottomSheet>,
    );
    expect(screen.getByTestId('kpi-sheet')).toBe(document.activeElement);
    const withPrevent = focusSpy.mock.calls
      .filter(c => (c[0] as FocusOptions | undefined)?.preventScroll === true);
    expect(withPrevent.length).toBeGreaterThan(0);

    unmount();
    expect(document.activeElement).toBe(trigger);
    focusSpy.mockRestore();
  });

  it('Tab-цикл замкнут внутри sheet', () => {
    render(
      <BottomSheet title="Сводка" onClose={() => {}} testId="kpi-sheet">
        {twoButtons()}
      </BottomSheet>,
    );
    const last = screen.getByTestId('last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });
});
