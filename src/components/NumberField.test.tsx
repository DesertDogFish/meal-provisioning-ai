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
        ariaLabel="Test input"
      />
    );
    
    // type=number имеет роль spinbutton, не textbox
    const input = screen.getByRole('spinbutton', { name: 'Test input' });
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
        ariaLabel="Test input"
      />
    );
    
    const input = screen.getByRole('spinbutton', { name: 'Test input' });
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
        ariaLabel="Test input"
      />
    );
    
    const input = screen.getByRole('spinbutton', { name: 'Test input' });
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
        ariaLabel="Test input"
      />
    );
    
    const input = screen.getByRole('spinbutton', { name: 'Test input' });
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

// Fix-3 (п.2): блокировка ввода — чек не вводится до подтверждения закупки
describe('NumberField — disabled (Fix-3)', () => {
  it('disabled блокирует input и обе кнопки степпера', () => {
    const { getByLabelText, getByTestId } = render(
      <NumberField value={100} onCommit={() => {}} disabled testId="nf-x" ariaLabel="Сумма" />
    );
    expect((getByLabelText('Сумма') as HTMLInputElement).disabled).toBe(true);
    expect((getByLabelText('Уменьшить') as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText('Увеличить') as HTMLButtonElement).disabled).toBe(true);
    expect(getByTestId('nf-x-wrap').className).toContain('nf-disabled');
  });
});

describe('NumberField — компактный размер sm (Fix-10, п.3)', () => {
  it('size="sm" добавляет класс nf-sm (CSS делает поле 28px — вровень с compact-input)', () => {
    const { container } = render(<NumberField value={null} onCommit={() => {}} size="sm" testId="nf-sm" />);
    const wrap = container.querySelector('.nf');
    expect(wrap?.className).toContain('nf-sm');
  });

  it('без size — прежний md (класс nf-sm отсутствует)', () => {
    const { container } = render(<NumberField value={null} onCommit={() => {}} testId="nf-md" />);
    expect(container.querySelector('.nf')?.className).not.toContain('nf-sm');
  });
});
