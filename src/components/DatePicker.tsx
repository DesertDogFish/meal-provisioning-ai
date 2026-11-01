import React from 'react';

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
  describedBy?: string;
}

/** Date → ISO YYYY-MM-DD без TZ-сдвига. */
const toISO = (d: Date | null | undefined): string | undefined => {
  if (!d) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function DatePicker({
  value,
  onChange,
  placeholder,
  minDate,
  maxDate,
  disabled,
  error,
  id,
  describedBy,
}: DatePickerProps) {
  const isoValue = value ?? '';
  const min = toISO(minDate);
  const max = toISO(maxDate);

  return (
    <div className="w-full">
      <input
        type="date"
        value={isoValue}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        id={id}
        aria-label={placeholder}
        aria-describedby={describedBy}
        aria-invalid={error}
        className={[
          'px-3 py-2 rounded-lg border bg-transparent text-sm',
          error ? 'border-red-500' : 'border-gray-600',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].filter(Boolean).join(' ')}
      />
    </div>
  );
}

export default DatePicker;
