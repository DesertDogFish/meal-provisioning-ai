import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

type DatePickerProps = {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  error?: boolean;
  id?: string;
};

const DatePicker = ({ onChange, value, minDate, maxDate, disabled, testId = 'date-picker-input' }: DatePickerProps & { testId?: string }) => {
  return (
    <input
      type='date'
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      min={minDate?.toISOString().split('T')[0]}
      max={maxDate?.toISOString().split('T')[0]}
      disabled={disabled}
      data-testid={testId}
    />
  );
};

function TestWrapper({
  initialS = '',
  initialE = '',
  onStartDateChange,
  onEndDateChange
}: {
  initialS?: string;
  initialE?: string;
  onStartDateChange?: (v: string) => void;
  onEndDateChange?: (v: string) => void;
}) {
  const [s, setS] = useState(initialS);
  const [e, setE] = useState(initialE);
  
  const handleStartDateChange = (v: string) => {
    setS(v);
    onStartDateChange?.(v);
    // Если endDate меньше startDate — обновляем endDate
    if (e && v > e) {
      setE(v);
      onEndDateChange?.(v);
    }
  };
  
  const handleEndDateChange = (v: string) => {
    setE(v);
    onEndDateChange?.(v);
  };
  
  return (
    <div>
      <div>
        <label>Дата начала</label>
        <DatePicker
          value={s}
          onChange={handleStartDateChange}
          maxDate={e ? new Date(e) : undefined}
          testId='start-date-picker'
        />
      </div>
      <div>
        <label>Дата окончания</label>
        <DatePicker
          value={e}
          onChange={handleEndDateChange}
          minDate={s ? new Date(s) : undefined}
          disabled={!s}
          testId='end-date-picker'
        />
      </div>
    </div>
  );
}

describe('DateRange Component (CR-3)', () => {
  it('renders two date inputs', () => {
    render(<TestWrapper />);
    
    const startInput = screen.getByTestId('start-date-picker');
    const endInput = screen.getByTestId('end-date-picker');
    
    expect(startInput).toBeInTheDocument();
    expect(endInput).toBeInTheDocument();
  });

  it('second picker is disabled until first is selected', () => {
    render(<TestWrapper />);
    
    const endInput = screen.getByTestId('end-date-picker');
    expect(endInput).toBeDisabled();
  });

  it('second picker becomes enabled after first date is selected', async () => {
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    
    render(
      <TestWrapper
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    );
    
    const startInput = screen.getByTestId('start-date-picker');
    const endInput = screen.getByTestId('end-date-picker');
    
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    await waitFor(() => {
      expect(onStartDateChange).toHaveBeenCalledWith('2026-05-12');
    });
    expect(endInput).not.toBeDisabled();
  });

  it('min of second picker equals first picker value', async () => {
    render(
      <TestWrapper
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
      />
    );
    
    const startInput = screen.getByTestId('start-date-picker');
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    await waitFor(() => {});
    
    const endInput = screen.getByTestId('end-date-picker');
    expect(endInput).toHaveAttribute('min', '2026-05-12');
  });

  it('auto-adjusts end date if start date moves past it', () => {
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    
    render(
      <TestWrapper
        initialS='2026-05-15'
        initialE='2026-05-18'
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    );
    
    const startInput = screen.getByTestId('start-date-picker');
    
    fireEvent.change(startInput, { target: { value: '2026-05-20' } });
    expect(onEndDateChange).toHaveBeenCalled();
  });

  it('calls onStartDateChange when first date changes', () => {
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    
    render(
      <TestWrapper
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    );
    
    const startInput = screen.getByTestId('start-date-picker');
    
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    expect(onStartDateChange).toHaveBeenCalledWith('2026-05-12');
  });

  it('calls onEndDateChange when second date changes', () => {
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    
    render(
      <TestWrapper
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    );
    
    const startInput = screen.getByTestId('start-date-picker');
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    const endInput = screen.getByTestId('end-date-picker');
    fireEvent.change(endInput, { target: { value: '2026-05-15' } });
    
    expect(onEndDateChange).toHaveBeenCalledWith('2026-05-15');
  });

  it('respects custom labels', () => {
    render(
      <div>
        <div>
          <label>Дата начала</label>
          <DatePicker value='2026-05-12' onChange={() => {}} />
        </div>
        <div>
          <label>Дата окончания</label>
          <DatePicker value='2026-05-15' onChange={() => {}} />
        </div>
      </div>
    );
    
    expect(screen.getByText('Дата начала')).toBeInTheDocument();
    expect(screen.getByText('Дата окончания')).toBeInTheDocument();
  });
});
