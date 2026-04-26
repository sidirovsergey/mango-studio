'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement | null>;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  children: ReactNode;
}

export function Popover({ open, onClose, anchor, placement = 'bottom', className, children }: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !anchor.current || !popRef.current) return;
    const a = anchor.current.getBoundingClientRect();
    const p = popRef.current.getBoundingClientRect();
    let top = 0;
    let left = 0;
    switch (placement) {
      case 'bottom':
        top = a.bottom + 8;
        left = a.left + a.width / 2 - p.width / 2;
        break;
      case 'top':
        top = a.top - p.height - 8;
        left = a.left + a.width / 2 - p.width / 2;
        break;
      case 'left':
        top = a.top + a.height / 2 - p.height / 2;
        left = a.left - p.width - 8;
        break;
      case 'right':
        top = a.top + a.height / 2 - p.height / 2;
        left = a.right + 8;
        break;
    }
    setPosition({ top, left });
  }, [open, anchor, placement]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (anchor.current?.contains(e.target as Node)) return;
      onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
    return () => document.removeEventListener('mousedown', onOutside, true);
  }, [open, onClose, anchor]);

  if (!open) return null;

  return (
    <div
      ref={popRef}
      className={cn(
        'fixed z-50 glass-frame p-2 min-w-[180px]',
        'animate-refine-in',
        className,
      )}
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
    >
      {children}
    </div>
  );
}
