'use client';

interface Props {
  projectStatus: string;
}

export function StageScenes(_props: Props) {
  return (
    <section className="stage" data-stage id="scenesStage" data-stub="phase-1.1.H">
      <div className="stage-head">
        <span className="stage-num">04</span>
        <div className="stage-title">Сцены</div>
      </div>
    </section>
  );
}
