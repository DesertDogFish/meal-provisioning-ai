import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { Button } from './Button';

/**
 * Fix-6 (п.7): «везде, где происходит важное удаление, которое повлияет на
 * результат, надо выдавать красивое окно предупреждения» — вместо голого
 * window.confirm. Брендовый модал: предупреждающая иконка, заголовок,
 * подробности (что именно будет стёрто), Отмена + danger-подтверждение.
 *
 * Использование через хук useConfirm():
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title, message, confirmLabel }))) return;
 *   ...danger action...
 *   {dialog}  // в JSX
 */

export interface ConfirmOptions {
  title: string;
  /** подробности — что именно будет потеряно/изменено */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' (удаление) | 'warning' (изменение с потерей данных) */
  tone?: 'danger' | 'warning';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: (ok: boolean) => void }) {
  const tone = state.tone ?? 'danger';
  return (
    <Modal onClose={() => onClose(false)}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-md p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title}
      >
        <div className="flex items-start gap-3">
          <span
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: tone === 'danger'
                ? 'color-mix(in srgb, var(--danger) 12%, transparent)'
                : 'color-mix(in srgb, var(--amber-500) 14%, transparent)',
              color: tone === 'danger' ? 'var(--danger)' : 'var(--amber-300)',
            }}
          >
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{state.title}</h2>
            <div className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
              {state.message}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            className="flex-1"
            onClick={() => onClose(true)}
          >
            {state.confirmLabel ?? 'Удалить'}
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => onClose(false)}>
            {state.cancelLabel ?? 'Отмена'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Промис-обёртка: `await confirm({...})` → true/false; `dialog` положить в JSX. */
export function useConfirm(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = (opts: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });

  const close = (ok: boolean) => {
    setState((cur) => {
      cur?.resolve(ok);
      return null;
    });
  };

  return {
    confirm,
    dialog: state ? <ConfirmDialog state={state} onClose={close} /> : null,
  };
}

export default ConfirmDialog;
