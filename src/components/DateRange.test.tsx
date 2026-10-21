import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRange } from './DateRange';

describe('DateRange Component (CR-3)', () => {
  it('renders two date inputs', () => {
    render(
      <DateRange
        startDate=""
        endDate=""
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
      />
    );
    
    // date input имеет нестабильную роль, используем getByLabelText
    const startInput = screen.getByLabelText('Дата начала');
    const endInput = screen.getByLabelText('Дата окончания');
    
    expect(startInput).toBeInTheDocument();
    expect(endInput).toBeInTheDocument();
  });

  it('second picker is disabled until first is selected', () => {
    render(
      <DateRange
        startDate=""
        endDate=""
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
      />
    );
    
    const endInput = screen.getByLabelText('Дата окончания');
    expect(endInput).toBeDisabled();
  });

  it('second picker becomes enabled after first date is selected', () => {
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    
    render(
      <DateRange
        startDate=""
        endDate=""
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    );
    
    const startInput = screen.getByLabelText('Дата начала');
    const endInput = screen.getByLabelText('Дата окончания');
    
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    expect(onStartDateChange).toHaveBeenCalledWith('2026-05-12');
    expect(endInput).toBeEnabled();
  });

  it('min of second picker equals first picker value', () => {
    render(
      <DateRange
        startDate="2026-05-12"
        endDate=""
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
      />
    );
    
    const endInput = screen.getByLabelText('Дата окончания');
    expect(endInput).toHaveAttribute('min', '2026-05-12');
  });

  it('auto-adjusts end date if start date moves past it', () => {
    const onEndDateChange = vi.fn();
    
    render(
      <DateRange
        startDate="2026-05-15"
        endDate="2026-05-12"
        onStartDateChange={() => {}}
        onEndDateChange={onEndDateChange}
      />
    );
    
    // When start date is after end date, end date should be adjusted
    const startInput = screen.getByLabelText('Дата начала');
    
    fireEvent.change(startInput, { target: { value: '2026-05-20' } });
    expect(onEndDateChange).toHaveBeenCalled();
  });

  it('calls onStartDateChange when first date changes', () => {
    const onStartDateChange = vi.fn();
    
    render(
      <DateRange
        startDate=""
        endDate=""
        onStartDateChange={onStartDateChange}
        onEndDateChange={() => {}}
      />
    );
    
    const startInput = screen.getByLabelText('Дата начала');
    
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    expect(onStartDateChange).toHaveBeenCalledWith('2026-05-12');
  });

  it('calls onEndDateChange when second date changes', () => {
    const onEndDateChange = vi.fn();
    
    render(
      <DateRange
        startDate="2026-05-12"
        endDate=""
        onStartDateChange={() => {}}
        onEndDateChange={onEndDateChange}
      />
    );
    
    const endInput = screen.getByLabelText('Дата окончания');
    
    fireEvent.change(endInput, { target: { value: '2026-05-15' } });
    
    expect(onEndDateChange).toHaveBeenCalledWith('2026-05-15');
  });

  it('respects custom labels', () => {
    render(
      <DateRange
        startDate=""
        endDate=""
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
        startLabel="Начало"
        endLabel="Конец"
      />
    );
    
    expect(screen.getByText('Начало')).toBeInTheDocument();
    expect(screen.getByText('Конец')).toBeInTheDocument();
  });
});
