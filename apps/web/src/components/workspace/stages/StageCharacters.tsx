'use client';

import { StageGate } from '../StageGate';
import { StageHead } from '../shared/StageHead';

interface Props {
  projectStatus: string;
}

export function StageCharacters({ projectStatus }: Props) {
  const unlocked = projectStatus !== 'draft';

  return (
    <section className="stage" data-stage id="charactersStage">
      <StageHead num="02" title="Персонажи" />
      <StageGate
        unlocked={unlocked}
        scrollToStageId="scriptStage"
        hint="Сначала создай сценарий"
      >
        <div className="char-grid">
          <div className="char-card-placeholder" style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-300)' }}>
            Персонажи появятся в Phase 1.2 (fal.ai)
          </div>
        </div>
      </StageGate>
    </section>
  );
}
