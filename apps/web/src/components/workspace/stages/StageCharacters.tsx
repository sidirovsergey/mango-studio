'use client';

interface Props {
  projectStatus: string;
}

export function StageCharacters(_props: Props) {
  return (
    <section className="stage" data-stage id="charactersStage" data-stub="phase-1.1.H">
      <div className="stage-head">
        <span className="stage-num">02</span>
        <div className="stage-title">Персонажи</div>
      </div>
    </section>
  );
}
