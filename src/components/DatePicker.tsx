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
  /** ISO YYYY-MM-DD — пробрасывается через inputProps (cloneElement их не отдаёт) */
  min?: string;
  max?: string;
  /** классы состояния (error/disabled) — тоже теряются в cloneElement */
  stateClassName?: string;
  /** значение из react-datepicker: formatted selected или напечатанный inputValue */
  value?: string | null;
  /** обработчик react-datepicker (парсит введённое по dateFormat) */
  onChange?: (...args: unknown[]) => void;
  /** НАШ колбэк: (ISO строка) → DateRange/DatePicker.onChange. Приоритетнее onChange. */
  onDateChange?: (value: string) => void;
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
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean | 'true' | 'false';
}

/**
 * Нормализатор значения для нативного input[type=date].
 *
 * react-datepicker хранит «напечатанное» состояние (state.inputValue) и отдаёт его
 * в cloneElement приоритетнее выбранной даты; формат задаётся `dateFormat`. Мы
 * ставим dateFormat="yyyy-MM-dd", поэтому значение уже имеет вид ISO YYYY-MM-DD —
 * оставляем его как есть. Пустое/нечитаемое → '' (нативный input так же нормализует
 * невалидный value).
 */
const normalizeForDateInput = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw === '') return '';
  // Уже ISO YYYY-MM-DD (controlled-значение, выбранный день или ручной ввод)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return toISO(d) ?? '';
  return '';
};

/**
 * Парсер значения из onChange react-datepicker.
 *
 * По умолчанию react-datepicker использует date-fns `parse(..., dateFormat, ...)`
 * и при несогласованности формата возвращает null → наверх летит пустое событие.
 * Мы переопределяем parseDate: ISO-строку принимаем как есть, остальное —
 * стандартным парсером.
 */
const parseDate = (text: string): Date | null => {
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00`);
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Нативный input[type=date] для react-datepicker (customInput).
 *
 * Зачем не дефолтный инпут react-datepicker: в jsdom/happy-dom (unit/e2e-гейт)
 * кастомный синтетический event от fireEvent.change НЕ совпадает с нативным
 * событием, которое слушает react-datepicker через addEventListener('change'),
 * поэтому колбэк onChange до компонента вообще не доходит (значение «залипает»).
 * Здесь мы подписываемся React-обработчиком (он ловит и synthetic, и native
 * события) и сами нормализуем value → ISO.
 */
const NativeInput = forwardRef<HTMLInputElement, NativeInputProps>(function NativeInput(props, ref) {
  // Берём только те пропсы, которые реально нужны инпуту: cloneElement отдаёт нам
  // всё внутреннее состояние react-datepicker, лишнее растеклось бы DOM-атрибутами.
  const {
    value, min, max, disabled, readOnly, required, placeholder,
    className, stateClassName, id, name, title, tabIndex, autoComplete, autoFocus, form,
    onFocus, onBlur, onClick, onKeyDown,
  } = props;
  // Собственный controlled-стейт: react-datepicker в тестовых средах (jsdom/
  // happy-dom) не пробрасывает synthetic change-события в свой onChange, поэтому
  // мы храним «напечатанное» значение сами и при необходимости синхронизируемся
  // с prop value (внешний controlled-источник — выбор из календаря, автоподтягивание).
  const [typed, setTyped] = React.useState<string | null>(null);
  const lastPropValue = React.useRef(value ?? '');
  if ((value ?? '') !== lastPropValue.current) {
    lastPropValue.current = value ?? '';
    setTyped(null); // prop изменился извне → сбрасываем локальный ввод
  }
  const display = typed != null ? typed : normalizeForDateInput(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value; // '' при очистке, ISO YYYY-MM-DD при выборе
    setTyped(next);
    // Надёжный путь: наш собственный колбэк (React-обработчик ловит и synthetic
    // события RTL/fireEvent, и нативные). Путь react-datepicker.onChange ниже
    // оставлен как резервный для реальных браузеров (native change-listener).
    if (props.onDateChange) props.onDateChange(next);
    else props.onChange?.(next);
  };

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
      className={[className, stateClassName].filter(Boolean).join(' ') || undefined}
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
      onChange={handleChange}
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
    // '' — явная очистка поля (нативный input отдаёт пустую строку).
    if (typeof date === 'string' && date === '') {
      onChange('');
      return;
    }
    const iso = dateToISO(date);
    if (!iso) {
      onChange('');
      return;
    }
    // ВАЖНО: здесь НЕ фильтруем по minDate/maxDate. Ограничения выборки в
    // календаре обеспечивает сам react-datepicker (minDate/maxDate), а ручному
    // вводу нативного input они не указ (контракт CR-3 в тестах TripForm:
    // endDate раньше startDate должен доходить до валидатора формы и давать
    // «endDate must be on or after startDate», а не молча отбрасываться).
    onChange(iso);
  };

  // Минимальный набор пропсов, которые реально нужны NativeInput. React-clone
  // передаёт внутреннее состояние react-datepicker в customInput — лишние поля
  // (onChange onClick и т.п.) растеклись бы DOM-атрибутами или перекрывали наш
  // обработчик, поэтому явно пробрасываем только нужное. onDateChange — наш
  // приоритетный колбэк: React-обработчик на <input type="date"> ловит и
  // synthetic-события RTL/fireEvent, и нативные события браузера.
  const inputProps: NativeInputProps = {
    value: value ?? '',
    min: toISO(minDate),
    max: toISO(maxDate),
    disabled,
    placeholder: placeholder ?? 'Выберите дату',
    stateClassName: `${error ? 'error' : ''} ${disabled ? 'disabled' : ''}`.trim() || undefined,
    onDateChange: handleChange,
  };

  return (
    <ReactDatePicker
      selected={selected}
      onChange={handleChange}
      parseDate={parseDate}
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
      className="date-picker-input"
      wrapperClassName="w-full date-picker-wrapper"
      customInput={<NativeInput {...inputProps} />}
    />
  );
}
