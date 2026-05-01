'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect } from 'react';

interface Props {
  children: ReactNode;
}

/**
 * Client wrapper around the modal backdrop + container.
 * Owns three close behaviours that must be client-side:
 *   1. Click on the backdrop (outside the modal card)
 *   2. Escape keypress
 *   3. Programmatic close from descendants (via the same URL strip)
 *
 * Closing strips ?char and ?tab from the URL using router.replace, which
 * triggers the page server component to re-render without the modal slot.
 */
export function CharacterModalShell({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete('char');
    next.delete('tab');
    const qs = next.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    router.replace(target, { scroll: false });
  }, [router, pathname, params]);

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // Lock background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Backdrop click: close only when the click landed on the backdrop itself,
  // not bubbled from the .char-modal card (stopPropagation on card).
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  // Backdrop scrim — keyboard close is provided by the Escape listener above;
  // satisfy biome's useKeyWithClickEvents with a no-op keyboard handler.
  const noopKey = () => {};

  return (
    <div
      className="char-modal-backdrop"
      data-modal-open
      onClick={onBackdropClick}
      onKeyDown={noopKey}
      role="presentation"
    >
      {children}
    </div>
  );
}
