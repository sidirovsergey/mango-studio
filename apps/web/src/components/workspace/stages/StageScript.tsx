'use client';

import type { Database } from '@mango/db/types';
import type { ScriptGenOutput } from '@mango/core';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

interface Props {
  project: ProjectRow;
  script: ScriptGenOutput | null;
}

export function StageScript(_props: Props) {
  return (
    <section className="stage" data-stage id="scriptStage" data-stub="phase-1.1.I">
      <div className="stage-head">
        <span className="stage-num">03</span>
        <div className="stage-title">Сценарий</div>
      </div>
    </section>
  );
}
