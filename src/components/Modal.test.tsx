/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal, { lockBodyScroll, unlockBodyScroll, bodyScrollLockCount } from './Modal';

/**
 * Подзадачи 4/10 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): модалка всегда
 * по центру и в пределах экрана. Центрирование и ограничение высоты задаёт CSS
 * (.modal-overlay — grid place-items:center + padding; .modal-wrap > * —
 * max-height: min(86dvh, 100%) + overflow-y:auto), поэтому здесь фиксируется
 * СТРУКТУРА, от которой зависит работа этих правил: портал в document.body,
 * наличие обёртки .modal-wrap (именно она держит max-height) и то, что лист
 * модалки — её прямой потомок.
 */
describe('Modal — портал, центрирование, ограничение по высоте экрана', () => {
  it('рендерится в портале document.body, а не в дереве страницы', () => {
    const { container } = render(
      <Modal onClose={() => {}}>
        <div role="dialog" aria-label="Лист">содержимое</div>
      </Modal>,
    );
    expect(container.querySelector('.modal-overlay')).toBeNull();
    expect(document.body.querySelector('.modal-overlay')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('структура: .modal-overlay > .modal-wrap > лист (max-height живёт на обёртке)', () => {
    render(
      <Modal onClose={() => {}}>
        <div className="modal-sheet" role="dialog" aria-label="Лист">x</div>
      </Modal>,
    );
    const overlay = document.body.querySelector('.modal-overlay') as HTMLElement;
    const wrap = overlay.querySelector(':scope > .modal-wrap') as HTMLElement;
    expect(wrap).toBeTruthy();
    // лист — ПРЯМОЙ потомок обёртки: только так срабатывает `.modal-wrap > *`
    expect(wrap.firstElementChild).toBe(screen.getByRole('dialog'));
  });

  it('Esc закрывает модалку', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><div role="dialog">x</div></Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('клик по затемнению закрывает, клик по листу — нет', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><div role="dialog" aria-label="Лист">x</div></Modal>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.body.querySelector('.modal-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('без onClose модалка не слушает Esc (нечего закрывать)', () => {
    render(<Modal><div role="dialog">x</div></Modal>);
    expect(() => fireEvent.keyDown(window, { key: 'Escape' })).not.toThrow();
  });

  it('блокирует скролл фона на всё время жизни и снимает блокировку при размонтировании', () => {
    const before = bodyScrollLockCount();
    const { unmount } = render(<Modal onClose={() => {}}><div role="dialog">x</div></Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    expect(bodyScrollLockCount()).toBe(before + 1);
    unmount();
    expect(bodyScrollLockCount()).toBe(before);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('счётчик блокировок не уходит в минус (защита от двойного unlock)', () => {
    const before = bodyScrollLockCount();
    lockBodyScroll();
    unlockBodyScroll();
    unlockBodyScroll();
    unlockBodyScroll();
    expect(bodyScrollLockCount()).toBe(before);
  });
});
