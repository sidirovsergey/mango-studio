'use client';

import Link from 'next/link';
import { StageGate } from '../StageGate';
import { StageHead } from '../shared/StageHead';

interface Props {
  projectId: string;
  projectStatus: string;
  hasReadyCharacter: boolean;
}

export function StageScenes({ projectId, projectStatus, hasReadyCharacter }: Props) {
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
        <div
          className="scene-grid-placeholder"
          style={{
            padding: '32px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <p style={{ margin: 0, color: 'var(--ink-300)' }}>
            Открой раскадровку — там собираются first-frame'ы, видео и финальный мастер-клип.
          </p>
          <Link
            href={`/projects/${projectId}/storyboard`}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              borderRadius: '10px',
              background: 'var(--mango-500)',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            🎬 Перейти к раскадровке
          </Link>
        </div>
      </StageGate>
    </section>
  );
}
