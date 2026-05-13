'use client';

import { generateMasterClipAction } from '@/server/actions/generateMasterClipAction';
import type { Database } from '@mango/db';
import { useEffect, useState, useTransition } from 'react';
import type { SceneView } from './Stage04Provider';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

interface Props {
  projectId: string;
  scenes: SceneView[];
  jobs: MediaJobRow[];
  onClose: () => void;
  onMasterStarted: () => void;
}

type SceneAudioState =
  | { state: 'ready' }
  | { state: 'in_flight'; kind: 'voice' | 'final_clip' }
  | { state: 'failed' }
  | { state: 'missing' };

function resolveSceneAudio(scene: SceneView, jobsForScene: MediaJobRow[]): SceneAudioState {
  if (scene.final_clip) return { state: 'ready' };
  const inFlight = jobsForScene.find(
    (j) =>
      (j.kind === 'voice' || j.kind === 'final_clip') &&
      ['pending', 'running'].includes(j.status),
  );
  if (inFlight) {
    return { state: 'in_flight', kind: inFlight.kind as 'voice' | 'final_clip' };
  }
  const failed = jobsForScene.find(
    (j) =>
      (j.kind === 'voice' || j.kind === 'final_clip') &&
      j.status === 'error' &&
      (j.retry_count ?? 0) >= 1,
  );
  if (failed) return { state: 'failed' };
  return { state: 'missing' };
}

const STATE_LABEL: Record<SceneAudioState['state'], string> = {
  ready: '🎵 готово',
  in_flight: '⏳ в работе',
  failed: '⚠ ошибка',
  missing: '— не озвучено',
};

export function FinalizeConfirmDialog({
  projectId,
  scenes,
  jobs,
  onClose,
  onMasterStarted,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [autoWait, setAutoWait] = useState(false);

  const states = scenes.map((s) => ({
    scene: s,
    state: resolveSceneAudio(
      s,
      jobs.filter((j) => j.scene_id === s.scene_id),
    ),
  }));
  const allReady = states.every((x) => x.state.state === 'ready');
  const anyFailed = states.some((x) => x.state.state === 'failed');

  // Auto-fire master concat once all scenes are ready (used by "Дождаться").
  useEffect(() => {
    if (!autoWait || !allReady) return;
    startTransition(async () => {
      const r = await generateMasterClipAction({ project_id: projectId });
      if (r.ok) onMasterStarted();
      else setError(r.error ?? 'не удалось запустить финализацию');
    });
    setAutoWait(false);
  }, [allReady, autoWait, projectId, onMasterStarted]);

  const runSilent = () => {
    setError(null);
    startTransition(async () => {
      const r = await generateMasterClipAction({ project_id: projectId });
      if (r.ok) onMasterStarted();
      else setError(r.error ?? 'не удалось запустить финализацию');
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
        <h2 className="modal-title">Финализировать ролик</h2>
        <p className="modal-sub">
          Не все сцены готовы со звуком. Можно дождаться или склеить без звука.
        </p>

        <ul className="finalize-scene-list">
          {states.map(({ scene, state }, i) => {
            const baseLabel = STATE_LABEL[state.state];
            const label =
              state.state === 'in_flight'
                ? state.kind === 'voice'
                  ? '⏳ озвучка'
                  : '⏳ сборка'
                : baseLabel;
            const shortDesc = scene.description.slice(0, 60);
            return (
              <li
                key={scene.scene_id}
                className={`finalize-scene-row state-${state.state}`}
                title={scene.description}
              >
                <span className="finalize-scene-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="finalize-scene-desc">{shortDesc}</span>
                <span className="finalize-scene-state">{label}</span>
              </li>
            );
          })}
        </ul>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn primary"
            onClick={() => setAutoWait(true)}
            disabled={pending || autoWait || anyFailed}
            title={
              anyFailed
                ? 'Часть сцен в ошибке — почини их сначала'
                : 'Подождать пока всё доедет, потом склеить'
            }
          >
            {autoWait || (pending && !error) ? 'Жду…' : 'Дождаться (~2 мин)'}
          </button>
          <button
            type="button"
            className="modal-btn"
            onClick={runSilent}
            disabled={pending}
            title="Склеить как есть — часть сцен будет молчать"
          >
            Склеить без звука
          </button>
        </div>
      </div>
    </div>
  );
}
