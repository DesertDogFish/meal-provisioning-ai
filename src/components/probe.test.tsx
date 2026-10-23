import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { DatePicker } from './DatePicker';

describe('probe dp', () => {
  it('controlled update', () => {
    cleanup();
    const onChange = vi.fn();
    const { rerender } = render(<DatePicker value={null} onChange={onChange} id="x" disabled />);
    const inp = () => document.getElementById('x') as HTMLInputElement;
    console.log('P1', JSON.stringify({v: inp().value, d: inp().disabled}));
    rerender(<DatePicker value="2026-07-01" onChange={onChange} id="x" disabled={false} minDate={new Date('2026-07-01T00:00:00')} />);
    console.log('P2', JSON.stringify({v: inp().value, d: inp().disabled, min: inp().getAttribute('min')}));
    fireEvent.change(inp(), { target: { value: '2026-07-10' } });
    console.log('P3 calls', JSON.stringify(onChange.mock.calls), 'domval', inp().value);
    rerender(<DatePicker value="2026-07-10" onChange={onChange} id="x" minDate={new Date('2026-07-10T00:00:00')} />);
    console.log('P4', JSON.stringify({v: inp().value, min: inp().getAttribute('min')}));
    expect(true).toBe(true);
  });
});
