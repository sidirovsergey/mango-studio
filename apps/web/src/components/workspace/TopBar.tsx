'use client';

import { setAutoModeAction } from '@/server/actions/projects';
import type { Tier } from '@mango/core';
import Link from 'next/link';
import { useTransition } from 'react';
import { TierToggle } from './TierToggle';

interface Props {
  projectId: string;
  autoMode: boolean;
  format: '9:16' | '16:9' | '1:1';
  tier: Tier;
}

export function TopBar({ projectId, autoMode, format, tier }: Props) {
  const [isPending, startTransition] = useTransition();

  const onAutoToggle = () => {
    startTransition(async () => {
      await setAutoModeAction({ project_id: projectId, auto_mode: !autoMode });
    });
  };

  return (
    <div className="topbar">
      <div className="brand">
        <Link href="/" className="back-pill" title="К landing">
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Назад
        </Link>
        <span className="brand-mark" />
        <span className="brand-name">
          Mango<span>Studio</span>
        </span>
      </div>
      <div className="topbar-right">
        <div className="seg" role="tablist" aria-label="Aspect" id="aspectSeg">
          {(['9:16', '16:9', '1:1'] as const).map((a) => (
            <button key={a} type="button" className={format === a ? 'active' : ''} data-aspect={a}>
              {a}
            </button>
          ))}
        </div>
        <TierToggle projectId={projectId} tier={tier} />
        <label
          className="auto-mode-toggle"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={autoMode}
            onChange={onAutoToggle}
            disabled={isPending}
            style={{ accentColor: 'var(--mango-500)' }}
          />
          <span
            style={{ fontSize: '13px', color: autoMode ? 'var(--mango-500)' : 'var(--ink-400)' }}
          >
            Авто-режим
          </span>
        </label>
        <div className="credits">
          <span className="dot" />
          ~12 480 кр
        </div>
        <button type="button" className="cta" id="publishBtn" disabled>
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          Опубликовать
        </button>
      </div>
    </div>
  );
}
