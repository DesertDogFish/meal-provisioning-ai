import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ru } from 'date-fns/locale';
import './DatePicker.css';

export interface DatePickerProps {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  error?: boolean;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  minDate,
  maxDate,
  disabled,
  error,
  id,
}: DatePickerProps) {
  const selected = value ? new Date(value) : null;

  const handleChange = (date: Date | null) => {
    if (date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${d}`);
    } else {
      onChange('');
    }
  };

  // Форматируем дату для HTML-атрибутов (YYYY-MM-DD)
  const toInputDate = (d: Date | null): string => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return (
    <ReactDatePicker
      selected={selected}
      onChange={handleChange}
      dateFormat="dd.MM.yyyy"
      locale={ru}
      placeholderText={placeholder ?? 'Выберите дату'}
      minDate={minDate}
      maxDate={maxDate}
      disabled={disabled}
      showPopperArrow={false}
      id={id}
      aria-label={placeholder ?? 'Выберите дату'}
      className={`date-picker-input ${error ? 'error' : ''} ${disabled ? 'disabled' : ''}`}
      calendarClassName="dark-calendar"
      wrapperClassName="w-full"
      inputProps={{
        min: toInputDate(minDate),
        max: toInputDate(maxDate),
      }}
    />
  );
}