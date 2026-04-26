import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies primary variant by default', () => {
    render(<Button>Test</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-mango-500');
  });

  it('applies ghost variant when specified', () => {
    render(<Button variant="ghost">Test</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');
  });

  it('forwards onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Test</Button>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects disabled prop', () => {
    render(<Button disabled>Test</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
