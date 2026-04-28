'use client';

interface Props {
  projectStatus: string;
}

export function StageFinal(_props: Props) {
  return (
    <section className="stage" data-stage id="finalStage" data-stub="phase-1.1.H">
      <div className="stage-head">
        <span className="stage-num">05</span>
        <div className="stage-title">Финал</div>
      </div>
    </section>
  );
}
