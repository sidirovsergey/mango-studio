import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full px-4 py-3 rounded-lg',
          'bg-paper text-ink-900 placeholder:text-ink-500',
          'border border-ink-900/10',
          'focus:outline-none focus:border-mango-500 focus:ring-2 focus:ring-mango-500/30',
          'transition-all duration-300 ease-spring-fast',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
