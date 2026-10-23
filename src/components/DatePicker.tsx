import React, { forwardRef } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ru } from 'date-fns/locale';
import './DatePicker.css';

export interface DatePickerProps {
  value: string | null;
  /** ISO-строка YYYY-MM-DD (или '' при очистке) */
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  error?: boolean;
  id?: string;
}

/** ISO YYYY-MM-DD без timezone-сдвига (локальные части даты, а не toISOString). */
const toISO = (d: Date | null | undefined): string | undefined => {
  if (!d) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Из Date (или строки YYYY-MM-DD) → ISO YYYY-MM-DD без TZ-сдвига. */
const dateToISO = (dateOrStr: Date | string | number | null): string => {
  if (dateOrStr == null) return '';
  if (typeof dateOrStr === 'string') return dateOrStr.slice(0, 10);
  if (typeof dateOrStr === 'number') return toISO(new Date(dateOrStr)) ?? '';
  return toISO(dateOrStr) ?? '';
};

/**
 * Нативный input для react-datepicker (customInput).
 * type="date" даёт нам:
 *  - значение в ISO-формате YYYY-MM-DD — стабильно для тестов (toHaveValue) и e2e (fill);
 *  - браузерные атрибуты min/max/disabled прямо на <input> — их проверяют контракты CR-3
 *    (у дефолтного инпута react-datepicker они теряются);
 *  - встроенную иконку календаря (CR-4), стилизованную в index.css.
 * При этом сам попапер react-datepicker остаётся: клик по полю открывает тёмный
 * календарь (.dark-calendar), выбор дня пишет ISO-дату в нативный input.
 */
interface NativeInputProps {
  /** значение из react-datepicker: formatted selected или напечатанный inputValue */
  value?: string | null;
  /** обработчик react-datepicker (парсит введённое по dateFormat) */
  onChange?: (...args: unknown[]) => void;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  name?: string;
  title?: string;
  tabIndex?: number | string;
  autoComplete?: string;
  autoFocus?: boolean;
  form?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | "true" | "false";
  'aria-required'?: boolean | "true" | "false";
  /** ISO YYYY-MM-DD — пробрасывается через inputProps (в cloneElement у react-datepicker их нет) */
  min?: string;
  max?: string;
}

/**
 * Нормализатор значения для нативного input[type=date].
 *
 * В内 react-datepicker хранит «напечатанное» состояние (state.inputValue) и отдаёт
 * его в getInputValue() приоритетнее выбранной даты, а форматированное значение
 * зависит от строки `dateFormat` (dd.MM.yyyy → «не date-value», сброс поля).
 * Поэтому вместо гадания на формате: если value совпадает с ISO-строкой нашей
 * controlled-даты (prop `value`) — это «напечатанное» нами же значение, оставляем;
 * иначе (выбор из попапера, ввод руками) — приводим через Date к ISO.
 * Пустое/нечитаемое → '' (нативный input так же нормализует невалидный value).
 */
const normalizeForDateInput = (raw: unknown, iso: string): string => {
  if (typeof raw !== 'string' || raw === '') return '';
  if (raw === iso) return iso; // снимает риск TZ-сдвига при round-trip
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return toISO(d) ?? '';
  return '';
};

const NativeInput = forwardRef<HTMLInputElement, NativeInputProps>(function NativeInput(props, ref) {
  // Берём только те пропсы, которые реально нужны инпуту: cloneElement отдаёт нам
  // всё внутреннее состояние react-datepicker, лишнее растеклось бы DOM-атрибутами.
  const {
    value, onChange, min, max, disabled, readOnly, required, placeholder,
    className, id, name, title, tabIndex, autoComplete, autoFocus, form,
    onFocus, onBlur, onClick, onKeyDown,
  } = props;
  const display = normalizeForDateInput(value, isoOf(props.isoValue));
  return (
    <input
      ref={ref}
      type="date"
      value={display}
      min={min}
      max={max}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      placeholder={placeholder}
      className={className}
      id={id}
      name={name}
      title={title}
      tabIndex={tabIndex as number | undefined}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      form={form}
      aria-label={props['aria-label']}
      aria-describedby={props['aria-describedby']}
      aria-invalid={props['aria-invalid']}
      aria-required={props['aria-required']}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onChange={e => onChange?.(e)}
    />
  );
});

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
  // Значение формы храним как ISO YYYY-MM-DD; native date input принимает его как есть.
  const selected = value ? new Date(`${value}T00:00:00`) : null;

  const handleChange = (date: Date | string | number | null) => {
    const iso = dateToISO(date);
    if (!iso) {
      onChange('');
      return;
    }
    // Внутренняя защита от ручного ввода вне [minDate, maxDate] (контракт CR-3).
    if (minDate && iso < (toISO(minDate) ?? '')) return;
    if (maxDate && iso > (toISO(maxDate) ?? '')) return;
    onChange(iso);
  };

  return (
    <ReactDatePicker
      selected={selected}
      onChange={handleChange}
      dateFormat="yyyy-MM-dd"
      locale={ru}
      placeholderText={placeholder ?? 'Выберите дату'}
      minDate={minDate}
      maxDate={maxDate}
      disabled={disabled}
      showPopperArrow={false}
      id={id}
      aria-label={placeholder ?? 'Выберите дату'}
      calendarClassName="dark-calendar"
      className={`date-picker-input ${error ? 'error' : ''} ${disabled ? 'disabled' : ''}`}
      wrapperClassName="w-full date-picker-wrapper"
      customInput={<NativeInput />}
      inputProps={{
        min: toISO(minDate),
        max: toISO(maxDate),
      }}
    />
  );
}
