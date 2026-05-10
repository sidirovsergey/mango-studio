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
  return (
    <article className="scene-row">
      <SceneThumbnailColumn {...props} />
      <SceneSidePanel {...props} />
    </article>
  );
}
