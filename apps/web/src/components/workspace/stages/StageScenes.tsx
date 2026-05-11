'use client';

import type { Tier } from '@mango/core';
import { StageGate } from '../StageGate';
import { StageHead } from '../shared/StageHead';
import { Stage04Inline } from './scenes/Stage04Inline';

interface Props {
  projectId: string;
  projectStatus: string;
  hasReadyCharacter: boolean;
  tier: Tier;
}

export function StageScenes({ projectId, projectStatus, hasReadyCharacter, tier }: Props) {
  const unlocked =
    hasReadyCharacter ||
    ['script_ready', 'characters_ready', 'scenes_ready', 'final_ready'].includes(projectStatus);

  return (
    <section className="stage" data-stage id="scenesStage">
      <StageHead num="04" title="Сцены" />
      <StageGate
        unlocked={unlocked}
        scrollToStageId="charactersStage"
        hint="Сначала сгенерируй хотя бы одного персонажа"
      >
        <Stage04Inline projectId={projectId} tier={tier} />
      </StageGate>
    </section>
  );
}
