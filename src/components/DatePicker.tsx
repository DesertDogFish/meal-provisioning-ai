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
 * Поле ввода для react-datepicker (customInput).
 *
 * ФАЗА 13 (UX): тип — `text`, а НЕ `date`. С `type="date"` браузер рисует
 * собственный системный пикер даты, который открывается по клику на иконку и
 * ломает дизайн (плюс локальные форматы отображения). Теперь единственный
 * календарь — наш тёмный попапер react-datepicker (.dark-calendar).
 *
 * Совместимость с контрактами сохранена:
 *  - значение нормализуем в ISO YYYY-MM-DD (тесты toHaveValue('2026-07-20'), e2e fill);
 *  - браузерные атрибуты min/max/disabled оставляем прямо на <input> — их
 *    проверяют контракты CR-3 (у дефолтного инпута react-datepicker теряются);
 *  - иконка календаря (CR-4) — собственная lucide-кнопка внутри поля; клик по
 *    любому месту поля открывает наш попапер (обработчик react-datepicker).
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
  /** ФАЗА 13: очистка поля (крестик внутри input[type=text]) */
  onClear?: () => void;
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
 * Нормализатор значения для текстового поля (ISO YYYY-MM-DD).
 *
 * react-datepicker хранит «напечатанное» состояние (state.inputValue) и отдаёт его
 * в cloneElement приоритетнее выбранной даты; формат задаётся `dateFormat`. Мы
 * ставим dateFormat="yyyy-MM-dd", поэтому значение уже имеет вид ISO YYYY-MM-DD —
 * оставляем его как есть. Пустое/нечитаемое → '' (поле остаётся чистым).
 */
const normalizeForDateInput = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw === '') return '';
  // Уже ISO YYYY-MM-DD (controlled-значение, выбранный день или ручной ввод)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return toISO(d) ?? '';
  return '';
};

/** Только ISO YYYY-MM-DD — для атрибута max нативного text-input (контракт CR-3). */
const isISODate = (s: unknown): boolean => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Парсер значения из onChange react-datepicker.
 *
 * По умолчанию react-datepicker использует date-fns `parse(..., dateFormat, ...)`
 * и при несогласованности формата возвращает null → наверх летит пустое событие.
 * Мы переопределяем parseDate: ISO-строку принимаем как есть, остальное —
 * стандартным парсером.
 *
 * ЗАМЕТКА (типизация): в реактовских .d.ts пакета react-datepicker@9 проп
 * `parseDate` отсутствует (в рантайме он поддерживается), поэтому хелпер
 * объявлен отдельно и подставляется через spread с приведением типа ниже —
 * это сохраняет поведение и не ломает strict typecheck.
 */
const parseDate = (text: string): Date | null => {
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00`);
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Пропсы ReactDatePicker, не вошедшие в public .d.ts пакета (но рабочие в рантайме). */
const undocumentedPickerProps = { parseDate } as unknown as Record<string, never>;

/**
 * Текстовое поле (type="text") для react-datepicker (customInput).
 *
 * ФАЗА 13: НЕ type="date" — нативный браузерный пикер подавлен полностью,
 * единственный календарь — попапер react-datepicker.
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
    className, stateClassName, id, name, title, tabIndex, autoFocus, form,
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
    const raw = e.target.value;
    // '' при очистке; ISO YYYY-MM-DD — принимаем как есть (выбор из календаря
    // приходит именно в этом виде благодаря dateFormat="yyyy-MM-dd"); частичный
    // ручной ввод оставляем в локальном состоянии («залипания» нет), наверх
    // отправляем только завершённую дату.
    if (raw === '') {
      setTyped('');
      if (props.onDateChange) props.onDateChange('');
      else props.onChange?.('');
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      setTyped(raw);
      if (props.onDateChange) props.onDateChange(raw);
      else props.onChange?.(raw);
      return;
    }
    setTyped(raw);
  };

  return (
    <span className="dp-field-wrap">
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        min={min}
        {...(isISODate(max) ? { max } : {})}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        placeholder={placeholder}
        className={['dp-text-input', className, stateClassName].filter(Boolean).join(' ') || undefined}
        id={id}
        name={name}
        title={title}
        tabIndex={tabIndex as number | undefined}
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
      {/* CR-4: иконка календаря — наша (lucide), а не браузерная. Клик по ней
          всплывает в input → открывает попапер react-datepicker. pointer-events:
          none, чтобы каретка поля не менялась. */}
      <svg
        className="dp-icon"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      {/* ФАЗА 13: очистка поля (у text-input нет браузерного «явного» крестика) */}
      {!disabled && !readOnly && display !== '' && props.onClear && (
        <button
          type="button"
          className="dp-clear"
          tabIndex={-1}
          aria-label="Очистить дату"
          onMouseDown={(e) => e.preventDefault()} // не даём инпуту потерять фокус раньше клика
          onClick={(e) => { e.stopPropagation(); props.onClear?.(); }}
        >
          ×
        </button>
      )}
    </span>
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
  // Значение формы храним как ISO YYYY-MM-DD; текстовое поле принимает его как есть.
  const selected = value ? new Date(`${value}T00:00:00`) : null;
  // ФАЗА 13: text-инпут не имеет браузерного пикера — попапером управляем сами
  // (клик по полю/иконке открывает, кликOutside/выбор даты закрывают).
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const handleChange = (date: Date | string | number | null) => {
    // '' — явная очистка поля (текстовое поле отдаёт пустую строку).
    if (typeof date === 'string' && date === '') {
      setPickerOpen(false);
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
    // вводу текстового поля они не указ (контракт CR-3 в тестах TripForm:
    // endDate раньше startDate должен доходить до валидатора формы и давать
    // «endDate must be on or after startDate», а не молча отбрасываться).
    setPickerOpen(false); // день выбран — закрываем попапер
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
      onInputClick={() => { if (!disabled) setPickerOpen(true); }}
      open={pickerOpen}
      onFocus={() => setPickerOpen(true)}
      onClickOutside={() => setPickerOpen(false)}
      {...undocumentedPickerProps}
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
      className="date-picker-input dp-text-input"
      wrapperClassName="w-full date-picker-wrapper"
      customInput={<NativeInput {...inputProps} />}
    />
  );
}
