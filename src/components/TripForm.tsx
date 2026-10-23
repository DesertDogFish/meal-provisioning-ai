import { useState } from 'react';
import { DateRange } from './DateRange';
import { validateTrip } from '../utils/validation';
import Modal from './Modal';
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
}

/**
 * Форма создания похода: название, спаренные даты (CR-3), количество человек, заметки.
 * Валидация через validateTrip (общая с бэкендом). Ошибки подсвечиваются по полям.
 */
export function TripForm({ onSubmit, onCancel, externalErrors = [], submitLabel = 'Создать', title = 'Новый поход' }: TripFormProps) {
  const [data, setData] = useState<TripFormData>(EMPTY_TRIP_FORM);
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
        className="rounded-2xl shadow-xl w-full max-w-md p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>{title}</h2>

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

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-full transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-full transition-colors"
            style={{
              
              opacity: submitting ? 0.6 : 1
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
