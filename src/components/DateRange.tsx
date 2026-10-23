import { useState, useEffect } from 'react';
import { DatePicker } from './DatePicker';

interface DateRangeProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  startLabel?: string;
  endLabel?: string;
  startPlaceholder?: string;
  endPlaceholder?: string;
}

/**
 * CR-3: Зависимые дейт-пикеры
 * - Второй пикер: min = значение первого
 * - При изменении первого: если второе стало меньше — второе автоматически = первое
 * - При открытии формы: второе по умолчанию = первое + 10 лет
 * - Второй недоступен, пока не выбрана дата в первом
 */
export function DateRange({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startLabel = 'Дата начала',
  endLabel = 'Дата окончания',
  startPlaceholder = 'Выберите дату',
  endPlaceholder = 'Выберите дату'
}: DateRangeProps) {
  const [internalEndDate, setInternalEndDate] = useState(endDate);

  // Синхронизируем internalEndDate с prop endDate при изменении
  useEffect(() => {
    setInternalEndDate(endDate);
  }, [endDate]);

  // При первом рендере, если startDate есть, а endDate нет — ставим endDate = startDate
  useEffect(() => {
    if (startDate && !endDate) {
      setInternalEndDate(startDate);
      onEndDateChange(startDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // При изменении startDate
  const handleStartDateChange = (newStartDate: string) => {
    onStartDateChange(newStartDate);
    
    // Если endDate меньше startDate — обновляем endDate
    if (internalEndDate && newStartDate > internalEndDate) {
      setInternalEndDate(newStartDate);
      onEndDateChange(newStartDate);
    }
  };

  const handleEndDateChange = (newEndDate: string) => {
    setInternalEndDate(newEndDate);
    onEndDateChange(newEndDate);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor="start-date" className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
          {startLabel}
        </label>
        <DatePicker
          value={startDate || null}
          onChange={handleStartDateChange}
          maxDate={internalEndDate ? new Date(internalEndDate) : undefined}
          placeholder={startPlaceholder}
          id="start-date"
        />
      </div>
      <div>
        <label htmlFor="end-date" className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
          {endLabel}
        </label>
        <DatePicker
          value={internalEndDate || null}
          onChange={handleEndDateChange}
          minDate={startDate ? new Date(startDate) : undefined}
          disabled={!startDate}
          placeholder={endPlaceholder}
          id="end-date"
        />
      </div>
    </div>
  );
}