import { describe, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { DatePicker } from '../components/DatePicker';

describe('probe2', () => {
  it('cb check', async () => {
    function W() {
      const [v, setV] = React.useState('');
      return (
        <DatePicker
          value={v || null}
          onChange={(val: string) => { console.log('CB1:', JSON.stringify(val)); setV(val); }}
          id="d1"
          placeholder="Дата окончания"
          minDate={new Date('2026-07-10T00:00:00')}
        />
      );
    }
    const { container } = render(<W />);
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '2026-08-05' } });
    await new Promise(r => setTimeout(r, 50));
    console.log('P1:', JSON.stringify(input.value));
  });
});
