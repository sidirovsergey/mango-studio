import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'ghost';
}

const sizeClasses = {
  sm: 'w-8 h-8 rounded-md text-base',
  md: 'w-10 h-10 rounded-lg text-lg',
  lg: 'w-12 h-12 rounded-xl text-xl',
};

const variantClasses = {
  solid: 'bg-mango-500 text-cream hover:opacity-90',
  ghost: 'bg-transparent text-ink-900 hover:bg-ink-900/5',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', variant = 'ghost', className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center',
          'transition-all duration-300 ease-spring-soft',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

IconButton.displayName = 'IconButton';
