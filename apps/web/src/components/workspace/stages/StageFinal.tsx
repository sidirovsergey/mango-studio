'use client';

import { StageGate } from '../StageGate';
import { StageHead } from '../shared/StageHead';

interface Props {
  projectStatus: string;
}

export function StageFinal({ projectStatus }: Props) {
  const unlocked = ['scenes_ready', 'final_ready'].includes(projectStatus);

  return (
    <section className="stage" data-stage id="finalStage">
      <StageHead num="05" title="Финал" />
      <StageGate
        unlocked={unlocked}
        scrollToStageId="scenesStage"
        hint="Сначала собери все сцены"
      >
        <div className="final-placeholder" style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-300)' }}>
          Финальный плеер появится в Phase 1.4
        </div>
      </StageGate>
    </section>
  );
}
