import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DateRange } from './DateRange';
import React, { useState } from 'react';

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
  return <DateRange
    startDate={s}
    endDate={e}
    onStartDateChange={(v) => { setS(v); onStartDateChange?.(v); }}
    onEndDateChange={(v) => { setE(v); onEndDateChange?.(v); }}
  />;
}

describe('DateRange Component (CR-3)', () => {
  it('renders two date inputs', () => {
    render(
      <TestWrapper />
    );
    
    const startInput = screen.getByLabelText('Дата начала');
    const endInput = screen.getByLabelText('Дата окончания');
    
    expect(startInput).toBeInTheDocument();
    expect(endInput).toBeInTheDocument();
  });

  it('second picker is disabled until first is selected', () => {
    render(
      <TestWrapper />
    );
    
    const endInput = screen.getByLabelText('Дата окончания');
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
    
    const startInput = screen.getByLabelText('Дата начала');
    const endInput = screen.getByLabelText('Дата окончания');
    
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    await waitFor(() => {
      expect(onStartDateChange).toHaveBeenCalledWith('2026-05-12');
    });
    expect(endInput).toBeEnabled();
  });

  it('min of second picker equals first picker value', async () => {
    render(
      <TestWrapper
        onStartDateChange={() => {}}
        onEndDateChange={() => {}}
      />
    );
    
    const startInput = screen.getByLabelText('Дата начала');
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    await waitFor(() => {});
    
    const endInput = screen.getByLabelText('Дата окончания');
    expect(endInput).toHaveAttribute('min', '2026-05-12');
  });

  it('auto-adjusts end date if start date moves past it', () => {
    const onStartDateChange = vi.fn(() => {});
    const onEndDateChange = vi.fn(() => {});
    
    render(
      <TestWrapper
        initialS="2026-05-15"
        initialE="2026-05-18"
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    );
    
    const startInput = screen.getByLabelText('Дата начала');
    
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
    
    const startInput = screen.getByLabelText('Дата начала');
    
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
    
    const startInput = screen.getByLabelText('Дата начала');
    fireEvent.change(startInput, { target: { value: '2026-05-12' } });
    
    const endInput = screen.getByLabelText('Дата окончания');
    
    fireEvent.change(endInput, { target: { value: '2026-05-15' } });
    
    expect(onEndDateChange).toHaveBeenCalledWith('2026-05-15');
  });

  it('respects custom labels', () => {
    // DateRange с пропсами startDate/endDate не '' не использует TestWrapper,
    // labels статичны в JSX, проверяем напрямую:
    render(
      <DateRange
        startDate="2026-05-12"
        endDate="2026-05-15"
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
