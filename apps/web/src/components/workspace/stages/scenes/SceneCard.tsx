'use client';

import type { MediaJobUiRow, SceneView } from '@/components/workspace/ScriptStateProvider';
import type { Character } from '@mango/core';
import { SceneSidePanel } from './SceneSidePanel';
import { SceneThumbnailColumn } from './SceneThumbnailColumn';

interface Props {
  projectId: string;
  scene: SceneView;
  index: number;
  characters: Character[];
  activeJob: MediaJobUiRow | null;
  failedAudioJob: MediaJobUiRow | null;
  tier: 'economy' | 'premium';
}

export function SceneCard(props: Props) {
  const num = String(props.index + 1).padStart(2, '0');
  const { failedAudioJob, ...rest } = props;
  return (
    <article className="scene-row" data-scene-index={num}>
      <SceneThumbnailColumn {...rest} failedAudioJob={failedAudioJob} />
      <SceneSidePanel sceneNum={num} {...rest} />
    </article>
  );
}
