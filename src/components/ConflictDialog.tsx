/**
 * BL-41 (AU-13): диалог конфликта оптимистичной блокировки.
 *
 * Появляется, когда сервер ответил `409 CONCURRENT_MODIFICATION`: данные на
 * экране устарели относительно БД (кто-то изменил поход в другой вкладке/
 * сессии). Выбор действий — «Обновить» (перечитать данные, продолжить работу
 * на свежей версии) или «Закрыть» (остаться на текущем экране; следующая
 * правка снова упрётся в конфликт — это осознанное решение пользователя).
 *
 * Слушает `conflictSignal` сам: любая мутация страницы, получившая 409, поднимает
 * диалог без ручной проводки колбэков через все вкладки.
 */
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { onConcurrentModification } from '../api/conflictSignal';

import Modal from './Modal';
import { Button } from './Button';

export interface ConflictDialogProps {
  /** Перечитать данные похода. Диалог закрывается после завершения. */
  onReload: () => Promise<void> | void;
  /** Текст заголовка (по умолчанию — про изменённые данные). */
  title?: string;
}

export function ConflictDialog({ onReload, title = 'Данные изменились' }: ConflictDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => onConcurrentModification(() => setOpen(true)), []);

  if (!open) return null;

  const reload = async () => {
    setBusy(true);
    try {
      await onReload();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={() => setOpen(false)}>
      <div
        className="modal-sheet rounded-2xl shadow-xl w-full max-w-md p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        data-testid="conflict-dialog"
      >
        <div className="flex items-start gap-3">
          <span
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--amber-500) 14%, transparent)', color: 'var(--amber-600)' }}
            aria-hidden="true"
          >
            <RefreshCw size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
            <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
              Пока вы редактировали, эти данные изменились в другом окне или на другом устройстве.
              Обновите страницу, чтобы увидеть актуальное состояние и не потерять чужие правки.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-5">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy} data-testid="conflict-dialog-dismiss">
            Закрыть
          </Button>
          <Button variant="primary" onClick={() => void reload()} disabled={busy} data-testid="conflict-dialog-reload">
            {busy ? 'Обновляем…' : 'Обновить'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
