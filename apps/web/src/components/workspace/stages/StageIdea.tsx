'use client';

import { StageHead } from '../shared/StageHead';
import type { Database } from '@mango/db/types';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

interface Props {
  project: ProjectRow;
}

export function StageIdea({ project }: Props) {
  const formatLabel = project.format === '9:16' ? 'Вертикаль'
    : project.format === '16:9' ? 'Горизонталь' : 'Квадрат';
  const styleLabel = project.style === '3d_pixar' ? '3D Pixar'
    : project.style === '2d_drawn' ? '2D рисованный' : 'Клей-арт';

  return (
    <section className="stage" data-stage id="ideaStage">
      <StageHead num="01" title="Идея">
        <span className="stage-subtitle">{`Обновлено ${new Date(project.updated_at).toLocaleString('ru-RU')}`}</span>
      </StageHead>
      <div className="idea-summary">
        <button className="meta-tile" data-edit="duration">
          <div className="key">Длительность</div>
          <div className="val" data-val><em>{project.target_duration_sec}</em> секунд</div>
        </button>
        <button className="meta-tile" data-edit="format">
          <div className="key">Формат</div>
          <div className="val" data-val>{project.format} · {formatLabel}</div>
        </button>
        <button className="meta-tile" data-edit="style">
          <div className="key">Стиль</div>
          <div className="val" data-val>{styleLabel}</div>
        </button>
      </div>
      <p className="stage-idea-text" style={{ marginTop: 16, color: 'var(--ink-500)' }}>{project.idea}</p>
    </section>
  );
}
