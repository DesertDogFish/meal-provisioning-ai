import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NumberField } from './NumberField';

describe('NumberField Component', () => {
  it('renders input with placeholder', () => {
    render(
      <NumberField
        value={null}
        onCommit={() => {}}
        placeholder="= план"
      />
    );
    
    const input = screen.getByPlaceholderText('= план');
    expect(input).toBeInTheDocument();
  });

  it('displays value when provided', () => {
    render(
      <NumberField
        value={100}
        onCommit={() => {}}
      />
    );
    
    const input = screen.getByDisplayValue('100');
    expect(input).toBeInTheDocument();
  });

  it('calls onCommit with null when input is cleared', () => {
    const onCommit = vi.fn();
    
    render(
      <NumberField
        value={100}
        onCommit={onCommit}
      />
    );
    
    const input = screen.getByDisplayValue('100');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it('calls onCommit with parsed value on blur', () => {
    const onCommit = vi.fn();
    
    render(
      <NumberField
        value={null}
        onCommit={onCommit}
      />
    );
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '250.5' } });
    fireEvent.blur(input);
    
    expect(onCommit).toHaveBeenCalledWith(250.5);
  });

  it('calls onCommit with parsed value on Enter key', () => {
    const onCommit = vi.fn();
    
    render(
      <NumberField
        value={null}
        onCommit={onCommit}
      />
    );
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(onCommit).toHaveBeenCalledWith(300);
  });

  it('respects min value', () => {
    const onCommit = vi.fn();
    
    render(
      <NumberField
        value={null}
        onCommit={onCommit}
        min={0}
      />
    );
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    
    expect(onCommit).toHaveBeenCalledWith(0);
  });

  it('respects maxDecimals', () => {
    const onCommit = vi.fn();
    
    render(
      <NumberField
        value={null}
        onCommit={onCommit}
        maxDecimals={2}
      />
    );
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '123.456789' } });
    fireEvent.blur(input);
    
    expect(onCommit).toHaveBeenCalledWith(123.46);
  });

  it('applies size="sm" class', () => {
    const { container } = render(
      <NumberField
        value={null}
        onCommit={() => {}}
        size="sm"
      />
    );
    
    const wrapper = container.querySelector('.nf-sm');
    expect(wrapper).toBeInTheDocument();
  });

  it('applies testId to wrapper', () => {
    render(
      <NumberField
        value={null}
        onCommit={() => {}}
        testId="custom-test-id"
      />
    );
    
    const wrapper = screen.getByTestId('custom-test-id-wrap');
    expect(wrapper).toBeInTheDocument();
  });

  it('applies ariaLabel to input', () => {
    render(
      <NumberField
        value={null}
        onCommit={() => {}}
        ariaLabel="Custom label"
      />
    );
    
    const input = screen.getByLabelText('Custom label');
    expect(input).toBeInTheDocument();
  });
});
