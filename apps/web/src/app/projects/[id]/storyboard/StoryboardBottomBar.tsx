'use client';

import { getDefaultVideoModel } from '@mango/core';
import type { Tier } from '@mango/core';

interface StoryboardBottomBarProps {
  tier: Tier;
}

const TIER_LABELS: Record<Tier, string> = {
  economy: 'Эконом',
  premium: 'Премиум',
};

export function StoryboardBottomBar({ tier }: StoryboardBottomBarProps) {
  const defaultVideoModel = getDefaultVideoModel(tier);
  // Show just the last path segment for readability
  const modelSlug = defaultVideoModel.split('/').at(-1) ?? defaultVideoModel;

  return (
    <footer className="storyboard-bottom-bar">
      <div className="bb-group">
        <span className="bb-label">Тариф</span>
        <span className="bb-value">{TIER_LABELS[tier]}</span>
      </div>

      <div className="bb-group">
        <span className="bb-label">Видеомодель</span>
        <span className="bb-value" title={defaultVideoModel}>
          {modelSlug}
        </span>
      </div>

      <div className="bb-group">
        <span className="bb-label">Соотношение</span>
        <span className="bb-value">9:16</span>
      </div>

      <div className="bb-group">
        <span className="bb-label">Длит. по умолч.</span>
        <span className="bb-value">8s</span>
      </div>
    </footer>
  );
}
