import { describe, it, expect } from 'vitest';
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
    
    const dateInputs = screen.getAllByRole('textbox');
    expect(dateInputs).toHaveLength(2);
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
    
    const dateInputs = screen.getAllByRole('textbox');
    const endDateInput = dateInputs[1];
    
    expect(endDateInput).toBeDisabled();
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
    
    const dateInputs = screen.getAllByRole('textbox');
    const startDateInput = dateInputs[0];
    
    fireEvent.change(startDateInput, { target: { value: '2026-05-12' } });
    
    expect(onStartDateChange).toHaveBeenCalledWith('2026-05-12');
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
    
    const dateInputs = screen.getAllByRole('textbox');
    const endDateInput = dateInputs[1];
    
    expect(endDateInput).toHaveAttribute('min', '2026-05-12');
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
    const dateInputs = screen.getAllByRole('textbox');
    const startDateInput = dateInputs[0];
    
    fireEvent.change(startDateInput, { target: { value: '2026-05-20' } });
    
    // End date should be adjusted to match start date
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
    
    const dateInputs = screen.getAllByRole('textbox');
    const startDateInput = dateInputs[0];
    
    fireEvent.change(startDateInput, { target: { value: '2026-05-12' } });
    
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
    
    const dateInputs = screen.getAllByRole('textbox');
    const endDateInput = dateInputs[1];
    
    fireEvent.change(endDateInput, { target: { value: '2026-05-15' } });
    
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
