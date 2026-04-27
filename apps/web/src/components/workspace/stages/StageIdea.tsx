import { StageHead } from '../shared/StageHead';

interface Props {
  idea?: string;
}

export function StageIdea({ idea }: Props) {
  return (
    <section className="stage" data-stage>
      <StageHead num="01" title="Идея">
        <div className="stage-meta">WIP · Task 77</div>
      </StageHead>
      {idea && (
        <p style={{ color: 'var(--ink-700)', fontSize: 14 }}>
          <em>Идея от пользователя:</em> {idea}
        </p>
      )}
    </section>
  );
}
