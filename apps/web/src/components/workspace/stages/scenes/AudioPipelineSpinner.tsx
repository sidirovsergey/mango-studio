'use client';

interface Props {
  kind: 'voice' | 'final_clip';
}

const LABEL: Record<Props['kind'], { title: string; sub: string }> = {
  voice: { title: 'озвучка готовится…', sub: 'обычно 15–40 сек' },
  final_clip: { title: 'собираю финал…', sub: 'обычно 10–20 сек' },
};

export function AudioPipelineSpinner({ kind }: Props) {
  const { title, sub } = LABEL[kind];
  return (
    <div className="audio-pipeline-loading">
      <div className="spinner" />
      <span className="audio-pipeline-label">{title}</span>
      <span className="audio-pipeline-sub">{sub}</span>
    </div>
  );
}
