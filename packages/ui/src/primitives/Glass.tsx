import { type ComponentProps, forwardRef } from 'react';
import { cn } from '../lib/cn';

type Variant = 'card' | 'panel';

interface GlassProps extends ComponentProps<'div'> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  card: 'glass',
  panel: 'glass-frame',
};

export const Glass = forwardRef<HTMLDivElement, GlassProps>(
  ({ variant = 'card', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(variantClasses[variant], className)}
        {...props}
      />
    );
  },
);

Glass.displayName = 'Glass';
