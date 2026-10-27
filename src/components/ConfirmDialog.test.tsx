import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useConfirm } from './ConfirmDialog';

/** Мини-хост для useConfirm: кнопка запускает confirm(), результат пишет в DOM. */
function Host({ opts, onResult }: { opts: Parameters<ReturnType<typeof useConfirm>['confirm']>[0]; onResult: (ok: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <div>
      <button type="button" onClick={() => { void confirm(opts).then(onResult); }}>open</button>
      {dialog}
    </div>
  );
}

describe('ConfirmDialog (Fix-6, п.7) — брендовые подтверждения', () => {
  it('показывает заголовок и подробности, «Подтвердить» резолвит true', async () => {
    let result: boolean | null = null;
    render(
      <Host
        opts={{ title: 'Удалить поход «Алтай»?', message: <>Уйдут 3 дн. и чеки.</>, confirmLabel: 'Удалить поход' }}
        onResult={(ok) => { result = ok; }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Удалить поход «Алтай»?');
    expect(dialog.textContent).toContain('Уйдут 3 дн. и чеки.');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить поход' }));
    await new Promise(r => setTimeout(r, 0));
    expect(result).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('«Отмена» резолвит false, действие не выполняется', async () => {
    let result: boolean | null = null;
    render(<Host opts={{ title: 'T', message: 'M' }} onResult={(ok) => { result = ok; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await new Promise(r => setTimeout(r, 0));
    expect(result).toBe(false);
  });

  it('дефолтная кнопка подтверждения — «Удалить»', () => {
    render(<Host opts={{ title: 'T', message: 'M' }} onResult={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeTruthy();
  });
});

describe('Блокировка скролла фона (Fix-7 п.1)', () => {
  it('пока диалог открыт — body не скроллится; после закрытия — восстанавливается', async () => {
    const { unmount } = render(<Host opts={{ title: 'T', message: 'M' }} onResult={() => {}} />);
    expect(document.body.style.overflow).not.toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    // закрытие (Отмена) — фон снова скроллится
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await new Promise(r => setTimeout(r, 0));
    expect(document.body.style.overflow).not.toBe('hidden');
    unmount();
  });

  it('вложенные оверлеи: фон разблокируется только после закрытия последнего', () => {
    const a = render(<Host opts={{ title: 'A', message: 'M' }} onResult={() => {}} />);
    const b = render(<Host opts={{ title: 'B', message: 'M' }} onResult={() => {}} />);
    const [btnA, btnB] = screen.getAllByRole('button', { name: 'open' });
    fireEvent.click(btnA);
    fireEvent.click(btnB);
    expect(document.body.style.overflow).toBe('hidden');
    // закрываем один из двух — блокировка ещё держится
    const cancels = screen.getAllByRole('button', { name: 'Отмена' });
    fireEvent.click(cancels[0]);
    expect(document.body.style.overflow).toBe('hidden');
    a.unmount();
    b.unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
