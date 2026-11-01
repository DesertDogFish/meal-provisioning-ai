import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { ProblemDetail } from '../types/errors';
import { getErrorMessage } from '../utils/errorHandler';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

type ToastType = 'error' | 'success' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showError: (problemDetail: ProblemDetail | string) => void;
  showSuccess: (message: string) => void;
  showInfo: (message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, title: string, message: string, duration = 5000) => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: Toast = { id, type, title, message, duration };
    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const showError = useCallback((problemDetailOrMessage: ProblemDetail | string) => {
    if (typeof problemDetailOrMessage === 'string') {
      addToast('error', 'Ошибка', problemDetailOrMessage);
    } else {
      addToast('error', problemDetailOrMessage.title, getErrorMessage(problemDetailOrMessage));
    }
  }, [addToast]);

  const showSuccess = useCallback((message: string) => {
    addToast('success', 'Успешно', message);
  }, [addToast]);

  const showInfo = useCallback((message: string) => {
    addToast('info', 'Информация', message);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ showError, showSuccess, showInfo, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 space-y-2 w-full max-w-md px-4"
      style={{ zIndex: 'var(--z-toast)' }}
      role="region"
      aria-label="Уведомления"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const icons = {
    error: <AlertCircle size={14} aria-hidden="true" />,
    success: <CheckCircle size={14} aria-hidden="true" />,
    info: <Info size={14} aria-hidden="true" />,
  };

  return (
    <div
      className={`toast toast--${toast.type} animate-slide-in`}
      // Ошибка прерывает скринридер (роль alert), остальные типы — вежливо (status).
      role={toast.type === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-3">
        <span className="toast__icon">{icons[toast.type]}</span>
        <div className="flex-1">
          <h4 className="toast__title">{toast.title}</h4>
          <p className="toast__msg">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(toast.id)}
          aria-label={`Закрыть уведомление: ${toast.title}`}
          className="toast__close"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
