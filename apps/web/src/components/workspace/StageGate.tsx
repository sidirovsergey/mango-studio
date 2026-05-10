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

  // Locked: do NOT mount expensive children (they may set up polling, Realtime
  // subscriptions, server-action effects that don't make sense for an empty
  // pre-script project). Render only a CTA pointing back to the prerequisite
  // stage. This fixes a v1.3.5 regression where Stage04Inline + Stage04Provider
  // + usePollJobs would mount unconditionally on draft projects.
  return (
    <button
      type="button"
      className="stage-gate-overlay"
      onClick={onOverlayClick}
      style={{
        width: '100%',
        minHeight: '120px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(4px)',
        border: '1px dashed var(--ink-200)',
        borderRadius: '14px',
        cursor: 'pointer',
        fontSize: '15px',
        color: 'var(--ink-500)',
      }}
    >
      {hint} ↑
    </button>
  );
}
