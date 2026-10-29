import { useState } from 'react';
import { X } from 'lucide-react';
import { DateRange } from './DateRange';
import { validateTrip } from '../utils/validation';
import Modal from './Modal';
import { Button } from './Button';
import type { FieldError } from '../types/errors';

export interface TripFormData {
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  notes: string;
}

export const EMPTY_TRIP_FORM: TripFormData = {
  name: '',
  startDate: '',
  endDate: '',
  defaultPeople: 4,
  notes: '',
};

interface TripFormProps {
  onSubmit: (data: TripFormData) => Promise<void> | void;
  onCancel: () => void;
  /** Внешняя ошибка (например, ответ API) — показывается над формой */
  externalErrors?: { field: string; message: string }[];
  submitLabel?: string;
  title?: string;
  /** U36 (список 26.10): режим редактирования — стартовые значения полей */
  initial?: Partial<TripFormData>;
}

/**
 * Форма создания похода: название, спаренные даты (CR-3), количество человек, заметки.
 * Валидация через validateTrip (общая с бэкендом). Ошибки подсвечиваются по полям.
 */
export function TripForm({ onSubmit, onCancel, externalErrors = [], submitLabel = 'Создать', title = 'Новый поход', initial }: TripFormProps) {
  const [data, setData] = useState<TripFormData>({ ...EMPTY_TRIP_FORM, ...(initial ?? {}) });
  const [formErrors, setFormErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const patch = (partial: Partial<TripFormData>) => {
    setData(prev => ({ ...prev, ...partial }));
    // Любая правка чистит ошибки — пользователь видит актуальный статус после следующей попытки
    if (formErrors.length > 0) setFormErrors([]);
  };

  const handleSubmit = async () => {
    const errors = validateTrip(data);
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors([]);
    setSubmitting(true);
    try {
      await onSubmit(data);
    } finally {
      setSubmitting(false);
    }
  };

  const errorFor = (field: string) =>
    formErrors.find(e => e.field === field) || externalErrors.find(e => e.field === field);

  return (
    <Modal onClose={onCancel}>
      <div
        className="modal-sheet rounded-2xl shadow-xl w-full max-w-md p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* U21 (список багов 25.10): крестик в шапке — единый способ закрытия
            модалок во всём приложении (кроме кнопок «Отмена» в подвале). */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Закрыть"
            className="p-2 rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {(formErrors.length > 0 || externalErrors.length > 0) && (
          <div className="mb-4 space-y-1" role="alert">
            {(formErrors.length > 0 ? formErrors : externalErrors).map((err, idx) => (
              <p key={idx} className="text-sm" style={{ color: 'var(--danger)' }}>
                <span className="font-medium">{err.field}:</span> {err.message}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="trip-name" className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Название
            </label>
            <input
              id="trip-name"
              type="text"
              value={data.name}
              onChange={e => patch({ name: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg outline-none"
              style={{
                background: 'color-mix(in srgb, var(--bg-0) 70%, transparent)',
                
                border: errorFor('name') ? '1px solid var(--danger)' : '1px solid var(--border)',
                color: 'var(--text)'
              }}
              placeholder="Поход на Алтай"
            />
          </div>

          <DateRange
            startDate={data.startDate}
            endDate={data.endDate}
            onStartDateChange={date => patch({ startDate: date })}
            onEndDateChange={date => patch({ endDate: date })}
            startLabel="Дата начала"
            endLabel="Дата окончания"
          />

          <div>
            <label htmlFor="trip-people" className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Количество человек
            </label>
            <input
              id="trip-people"
              type="number"
              min={1}
              value={data.defaultPeople}
              onChange={e => patch({ defaultPeople: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2.5 rounded-lg outline-none"
              style={{
                background: 'color-mix(in srgb, var(--bg-0) 70%, transparent)',
                
                border: errorFor('defaultPeople') ? '1px solid var(--danger)' : '1px solid var(--border)',
                color: 'var(--text)'
              }}
            />
          </div>

          <div>
            <label htmlFor="trip-notes" className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Заметки
            </label>
            <textarea
              id="trip-notes"
              value={data.notes}
              onChange={e => patch({ notes: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg outline-none"
              style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
              rows={2}
              placeholder="Особенности похода..."
            />
          </div>
        </div>

        {/* Fix-8 (п.1/2): кнопки подвала — компонент Button (дизайн-система):
            «Создать» снова с фирменным фоном и обводкой (раньше style был пустым —
            голая прозрачная кнопка), текст центрирован (justify-content у .btn),
            иконка/спиннер — с единым зазором. */}
        <div className="flex gap-3 mt-6">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
            Отмена
          </Button>
          <Button variant="primary" size="sm" className="flex-1" onClick={handleSubmit} loading={submitting}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
