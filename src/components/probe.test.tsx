import { describe, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { DateRange } from './DateRange';

describe('probe', () => {
  it('range interaction', () => {
    function W() {
      const [d, setD] = React.useState({ startDate: '', endDate: '' });
      return (
        <div>
          <DateRange
            startDate={d.startDate}
            endDate={d.endDate}
            onStartDateChange={v => setD(p => ({ ...p, startDate: v }))}
            onEndDateChange={v => setD(p => ({ ...p, endDate: v }))}
          />
          <span data-testid="state">{JSON.stringify(d)}</span>
        </div>
      );
    }
    const { getByLabelText, getByTestId } = render(<W />);
    const end = () => getByLabelText('Дата окончания') as HTMLInputElement;
    console.log('X1 disabled:', end().disabled, 'min:', end().getAttribute('min'));
    fireEvent.change(getByLabelText('Дата начала'), { target: { value: '2026-07-01' } });
    console.log('X2 state:', getByTestId('state').textContent, 'disabled:', end().disabled, 'min:', end().getAttribute('min'));
    fireEvent.change(end(), { target: { value: '2026-07-05' } });
    console.log('X3 state:', getByTestId('state').textContent, 'endVal:', end().value);
    fireEvent.change(getByLabelText('Дата начала'), { target: { value: '2026-07-20' } });
    console.log('X4 state:', getByTestId('state').textContent, 'endVal:', end().value);
  });
});
