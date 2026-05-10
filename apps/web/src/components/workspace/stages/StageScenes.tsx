'use client';

import type { PersistedScript, Tier } from '@mango/core';
import { StageGate } from '../StageGate';
import { StageHead } from '../shared/StageHead';
import { Stage04Inline } from './scenes/Stage04Inline';
import type { Stage04Script } from './scenes/Stage04Provider';

interface Props {
  projectId: string;
  projectStatus: string;
  hasReadyCharacter: boolean;
  tier: Tier;
  initialScript: PersistedScript | null;
}

export function StageScenes({
  projectId,
  projectStatus,
  hasReadyCharacter,
  tier,
  initialScript,
}: Props) {
  const unlocked =
    hasReadyCharacter ||
    ['script_ready', 'characters_ready', 'scenes_ready', 'final_ready'].includes(projectStatus);

  // PersistedScript's compile-time shape is still the legacy one (scenes: Scene[],
  // master_clip: MasterClip | null). Runtime data is the Phase 1.3.5 versioned
  // shape — see migration.ts. Cast at the boundary; downstream components consume
  // SceneView from Stage04Provider.
  const initial = initialScript as unknown as Stage04Script | null;

  return (
    <section className="stage" data-stage id="scenesStage">
      <StageHead num="04" title="Сцены" />
      <StageGate
        unlocked={unlocked}
        scrollToStageId="charactersStage"
        hint="Сначала сгенерируй хотя бы одного персонажа"
      >
        <Stage04Inline projectId={projectId} tier={tier} initialScript={initial} />
      </StageGate>
    </section>
  );
}
