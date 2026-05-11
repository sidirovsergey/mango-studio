'use client';

import type { Character } from '@mango/core';
import type { Database } from '@mango/db';
import { SceneSidePanel } from './SceneSidePanel';
import { SceneThumbnailColumn } from './SceneThumbnailColumn';
import type { SceneView } from './Stage04Provider';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

interface Props {
  projectId: string;
  scene: SceneView;
  index: number;
  characters: Character[];
  activeJob: MediaJobRow | null;
  tier: 'economy' | 'premium';
}

export function SceneCard(props: Props) {
  const num = String(props.index + 1).padStart(2, '0');
  return (
    <article className="scene-row" data-scene-index={num}>
      <aside className="scene-anchor" aria-hidden>
        <span className="scene-anchor-num">{num}</span>
        <span className="scene-anchor-rule" />
        <span className="scene-anchor-label">scene</span>
      </aside>
      <SceneThumbnailColumn {...props} />
      <SceneSidePanel {...props} />
    </article>
  );
}
