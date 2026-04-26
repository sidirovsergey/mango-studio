import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter idea" />);
    expect(screen.getByPlaceholderText('Enter idea')).toBeInTheDocument();
  });

  it('forwards value and onChange', () => {
    const onChange = vi.fn();
    render(<Input value="hello" onChange={onChange} />);
    const input = screen.getByDisplayValue('hello');
    fireEvent.change(input, { target: { value: 'world' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('respects disabled prop', () => {
    render(<Input disabled placeholder="X" />);
    expect(screen.getByPlaceholderText('X')).toBeDisabled();
  });
});
