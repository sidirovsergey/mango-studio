'use client';

import { StageHead } from '../shared/StageHead';

interface Props {
  projectStatus: string;
}

export function StageCharacters({ projectStatus: _ }: Props) {
  return (
    <section className="stage" data-stage id="charactersStage">
      <StageHead num="02" title="Персонажи" />
      <div className="char-grid">
        <div
          className="char-card-placeholder"
          style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-300)' }}
        >
          Персонажи появятся в Phase 1.2 (fal.ai)
        </div>
      </div>
    </section>
  );
}
