import { useState, useEffect } from 'react';

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

  // При первом рендере, если startDate есть, а endDate нет — ставим endDate = startDate
  useEffect(() => {
    if (startDate && !endDate) {
      setInternalEndDate(startDate);
      onEndDateChange(startDate);
    }
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
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
          {startLabel}
        </label>
        <input
          type="date"
          value={startDate}
          onChange={e => handleStartDateChange(e.target.value)}
          max={internalEndDate || undefined}
          placeholder={startPlaceholder}
          className="w-full px-3 py-2.5 rounded-lg outline-none"
          style={{ 
            background: 'var(--elev)', 
            border: '1px solid var(--border)', 
            color: 'var(--text)' 
          }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
          {endLabel}
        </label>
        <input
          type="date"
          value={internalEndDate}
          onChange={e => handleEndDateChange(e.target.value)}
          min={startDate || undefined}
          disabled={!startDate}
          placeholder={endPlaceholder}
          className="w-full px-3 py-2.5 rounded-lg outline-none disabled:opacity-50"
          style={{ 
            background: 'var(--elev)', 
            border: '1px solid var(--border)', 
            color: 'var(--text)' 
          }}
        />
      </div>
    </div>
  );
}
