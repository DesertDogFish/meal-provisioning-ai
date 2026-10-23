import { useEffect } from 'react';
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
  // При первом рендере, если startDate есть, а endDate нет — ставим endDate = startDate
  useEffect(() => {
    if (startDate && !endDate) {
      onEndDateChange(startDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // При изменении startDate
  const handleStartDateChange = (newStartDate: string) => {
    onStartDateChange(newStartDate);
    
    // Если endDate меньше startDate — обновляем endDate.
    // ВАЖНО: сверяемся с prop endDate (состояние формы), а не с локальным:
    // на маунте автоподтягивание заполняет endDate = startDate, и сравнение
    // с ним «съедало» только что выбранную пользователем endDate (регрессия CR-3).
    if (endDate && newStartDate > endDate) {
      onEndDateChange(newStartDate);
    }
  };

  const handleEndDateChange = (newEndDate: string) => {
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
          maxDate={endDate ? new Date(`${endDate}T00:00:00`) : undefined}
          placeholder={startPlaceholder}
          id="start-date"
        />
      </div>
      <div>
        <label htmlFor="end-date" className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
          {endLabel}
        </label>
        <DatePicker
          value={endDate || null}
          onChange={handleEndDateChange}
          minDate={startDate ? new Date(`${startDate}T00:00:00`) : undefined}
          disabled={!startDate}
          placeholder={endPlaceholder}
          id="end-date"
        />
      </div>
    </div>
  );
}