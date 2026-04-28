'use client';

import type { Database } from '@mango/db/types';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

interface Props {
  project: ProjectRow;
}

export function StageIdea(_props: Props) {
  return (
    <section className="stage" data-stage id="ideaStage" data-stub="phase-1.1.H">
      <div className="stage-head">
        <span className="stage-num">01</span>
        <div className="stage-title">Идея</div>
      </div>
    </section>
  );
}
