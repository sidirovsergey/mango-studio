import { type ImgHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

interface AvatarProps extends ImgHTMLAttributes<HTMLImageElement> {
  size?: 'sm' | 'md' | 'lg';
  fallback?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-base',
};

export const Avatar = forwardRef<HTMLImageElement, AvatarProps>(
  ({ size = 'md', fallback, className, src, alt = 'Avatar', ...props }, ref) => {
    if (!src && fallback) {
      return (
        <div
          className={cn(
            'inline-flex items-center justify-center rounded-full',
            'bg-mango-500/10 text-ink-900 font-medium',
            sizeClasses[size],
            className,
          )}
        >
          {fallback}
        </div>
      );
    }
    return (
      <img
        {...props}
        ref={ref}
        src={src}
        alt={alt}
        className={cn('rounded-full object-cover', sizeClasses[size], className)}
      />
    );
  },
);

Avatar.displayName = 'Avatar';
