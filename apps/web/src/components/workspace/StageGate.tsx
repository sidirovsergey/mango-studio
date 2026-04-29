'use client';

import type { ReactNode } from 'react';
import { useCallback } from 'react';

interface Props {
  unlocked: boolean;
  scrollToStageId: string;
  hint: string;
  children: ReactNode;
}

export function StageGate({ unlocked, scrollToStageId, hint, children }: Props) {
  const onOverlayClick = useCallback(() => {
    const target = document.getElementById(scrollToStageId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollToStageId]);

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="stage-gate-wrap" style={{ position: 'relative' }}>
      <div style={{ opacity: 0.3, pointerEvents: 'none' }} aria-hidden>
        {children}
      </div>
      <button
        type="button"
        className="stage-gate-overlay"
        onClick={onOverlayClick}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(4px)',
          border: '1px dashed var(--ink-200)',
          borderRadius: 'inherit',
          cursor: 'pointer',
          fontSize: '15px',
          color: 'var(--ink-500)',
        }}
      >
        {hint} ↑
      </button>
    </div>
  );
}
