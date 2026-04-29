'use client';

import { StageGate } from '../StageGate';
import { StageHead } from '../shared/StageHead';

interface Props {
  projectStatus: string;
}

export function StageScenes({ projectStatus }: Props) {
  const unlocked = ['characters_ready', 'scenes_ready', 'final_ready'].includes(projectStatus);

  return (
    <section className="stage" data-stage id="scenesStage">
      <StageHead num="04" title="Сцены" />
      <StageGate
        unlocked={unlocked}
        scrollToStageId="charactersStage"
        hint="Сначала закончи персонажей"
      >
        <div
          className="scene-grid-placeholder"
          style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-300)' }}
        >
          Сцены появятся в Phase 1.3 (fal.ai video)
        </div>
      </StageGate>
    </section>
  );
}
