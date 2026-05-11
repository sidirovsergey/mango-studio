'use client';

import { usePollJobs } from '@/hooks/use-poll-jobs';
import { generateMasterClipAction } from '@/server/actions/generateMasterClipAction';
import '@/styles/storyboard-inline.css';
import type { Database } from '@mango/db';
import { useEffect, useState, useTransition } from 'react';
import { CostMeter } from './CostMeter';
import { CostWarningToast } from './CostWarningToast';
import { SceneCard } from './SceneCard';
import { useStage04 } from './Stage04Provider';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

interface Stage04InlineProps {
  projectId: string;
  tier: 'economy' | 'premium';
}

/**
 * Scroll the user's attention to Stage 05 (Финал) — that's where the
 * master clip player lives now. Called after finalize starts AND when
 * user clicks "Открыть ролик" on a ready master.
 */
function scrollToFinal() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('finalStage');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Stage04Inline({ projectId, tier }: Stage04InlineProps) {
  const { script, jobs } = useStage04();
  const [masterError, setMasterError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  usePollJobs(projectId);

  // Auto-clear error after 6s so it doesn't linger
  useEffect(() => {
    if (!masterError) return;
    const t = setTimeout(() => setMasterError(null), 6000);
    return () => clearTimeout(t);
  }, [masterError]);

  const scenes = script?.scenes ?? [];
  const characters = script?.characters ?? [];
  const masterVersions = script?.master_clip_versions ?? [];
  const masterActiveId = script?.master_clip_active_version_id ?? null;
  const activeMaster = masterVersions.find((m) => m.version_id === masterActiveId) ?? null;

  const jobsByScene: Record<string, MediaJobRow> = {};
  for (const job of jobs) {
    if (job.scene_id && ['pending', 'running'].includes(job.status)) {
      const existing = jobsByScene[job.scene_id];
      if (!existing || (job.created_at ?? '') > (existing.created_at ?? '')) {
        jobsByScene[job.scene_id] = job;
      }
    }
  }

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);

  // A scene is "ready for master" when it has at least an active video version
  // (final_clip is the muxed video+voice composition, but the master concat can
  // fall back to using the raw active video URL when final_clip is missing —
  // e.g. legacy scenes generated before the mux pipeline existed).
  const isSceneReady = (s: (typeof scenes)[number]) =>
    s.final_clip !== null || s.video_active_version_id !== null;
  const readySceneCount = scenes.filter(isSceneReady).length;
  const allScenesReady = scenes.length > 0 && readySceneCount === scenes.length;
  const masterInFlight = jobs.some(
    (j) => j.kind === 'master_clip' && ['pending', 'running'].includes(j.status),
  );

  const handleMasterClick = () => {
    setMasterError(null);
    if (masterInFlight) {
      scrollToFinal();
      return;
    }
    if (activeMaster) {
      scrollToFinal();
      return;
    }
    if (!allScenesReady) return;
    startTransition(async () => {
      const r = await generateMasterClipAction({ project_id: projectId });
      if (r.ok) {
        // Job submitted — scroll user to Stage 05 where the result will land.
        scrollToFinal();
      } else {
        setMasterError(r.error ?? 'не удалось запустить финализацию');
      }
    });
  };

  const masterButton = (() => {
    if (masterInFlight) {
      return {
        label: 'Финализирую…',
        disabled: false,
        title: 'Идёт сборка — открыть Stage 05 «Финал» чтобы дождаться',
        busy: true,
        variant: 'busy' as const,
      };
    }
    if (activeMaster) {
      return {
        label: 'Открыть ролик',
        disabled: false,
        title: 'Готовый master_clip — открыть превью в секции «Финал»',
        busy: false,
        variant: 'ready' as const,
      };
    }
    if (!allScenesReady) {
      return {
        label: 'Финализировать ролик',
        disabled: true,
        title: `${readySceneCount}/${scenes.length} сцен готовы — нужно сгенерировать видео для всех сцен`,
        busy: false,
        variant: 'idle' as const,
      };
    }
    return {
      label: pending ? 'Запускаю…' : 'Финализировать ролик',
      disabled: pending,
      title: 'Склеить все сцены в финальный ролик через ffmpeg (~$0.005) — результат в Stage 05',
      busy: pending,
      variant: 'active' as const,
    };
  })();

  return (
    <section className="stage-04-inline">
      <div className="stage-04-toolbar">
        <p className="stage-04-sub">
          <span>{scenes.length} сцен</span>
          <span className="dot" aria-hidden>
            ·
          </span>
          <span>{totalDuration} сек</span>
          <span className="dot" aria-hidden>
            ·
          </span>
          <span>{tier === 'premium' ? 'Premium' : 'Economy'}</span>
          {scenes.length > 0 && (
            <>
              <span className="dot" aria-hidden>
                ·
              </span>
              <span className={`readiness ${allScenesReady ? 'ready' : 'pending'}`}>
                {readySceneCount} / {scenes.length} готово к сборке
              </span>
            </>
          )}
        </p>
        <div className="stage-04-cluster">
          <CostMeter projectId={projectId} jobs={jobs} />
          <button
            type="button"
            className={`master-btn master-btn-${masterButton.variant}${masterButton.busy ? ' busy' : ''}`}
            onClick={handleMasterClick}
            disabled={masterButton.disabled}
            title={masterButton.title}
            aria-busy={masterButton.busy}
          >
            <span className="master-btn-dot" aria-hidden />
            <span className="master-btn-label">{masterButton.label}</span>
          </button>
        </div>
      </div>

      {masterError && (
        <div className="master-error" role="alert">
          <span className="scene-error-tag">ERR</span> {masterError}
        </div>
      )}

      <div className="scene-list">
        {scenes.map((scene, i) => (
          <SceneCard
            key={scene.scene_id}
            projectId={projectId}
            scene={scene}
            index={i}
            characters={characters}
            activeJob={jobsByScene[scene.scene_id] ?? null}
            tier={scene.config_overrides?.tier ?? tier}
          />
        ))}
        {scenes.length === 0 && (
          <p className="scene-empty">Нет сцен. Сначала сгенерируй сценарий (Stage 03).</p>
        )}
      </div>

      <CostWarningToast projectId={projectId} jobs={jobs} />
    </section>
  );
}
