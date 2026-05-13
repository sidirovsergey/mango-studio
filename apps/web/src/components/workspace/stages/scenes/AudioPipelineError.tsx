'use client';

import { retrySceneAudioAction } from '@/server/actions/retrySceneAudioAction';
import { useState, useTransition } from 'react';

interface Props {
  projectId: string;
  sceneId: string;
  kind: 'voice' | 'final_clip';
}

const KIND_LABEL: Record<Props['kind'], string> = {
  voice: 'озвучка',
  final_clip: 'сборка',
};

export function AudioPipelineError({ projectId, sceneId, kind }: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onRetry = () => {
    setErr(null);
    startTransition(async () => {
      const r = await retrySceneAudioAction({
        project_id: projectId,
        scene_id: sceneId,
        kind,
      });
      if (!r.ok) setErr(r.error);
    });
  };

  return (
    <div className="audio-pipeline-error" role="alert">
      <span className="audio-pipeline-error-icon" aria-hidden>
        ⚠
      </span>
      <span className="audio-pipeline-error-label">{KIND_LABEL[kind]} не получилась</span>
      <button type="button" className="audio-pipeline-retry" onClick={onRetry} disabled={pending}>
        {pending ? 'запускаю…' : 'попробовать снова'}
      </button>
      {err && <span className="audio-pipeline-error-detail">{err}</span>}
    </div>
  );
}
