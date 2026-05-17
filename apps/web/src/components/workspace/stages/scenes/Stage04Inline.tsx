'use client';

import { useTierGate } from '@/components/account/TierGateProvider';
import { usePollJobs } from '@/hooks/use-poll-jobs';
import { generateMasterClipAction } from '@/server/actions/generateMasterClipAction';
import '@/styles/storyboard-inline.css';
import '@/styles/audio-pipeline.css';
import type { Database } from '@mango/db';
import { useEffect, useState, useTransition } from 'react';
import { CostMeter } from './CostMeter';
import { CostWarningToast } from './CostWarningToast';
// FinalizeConfirmDialog import dropped 2026-05-13 — the dialog only existed to
// gate on missing voice / final_clip, which no longer happens.
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
  const { open: openTierGate } = useTierGate();
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

  // Phase 1.4.1: per-scene audio failure after retry_count is exhausted.
  // Surfaces the failed-state UI with manual retry button.
  const failedAudioByScene: Record<string, MediaJobRow> = {};
  for (const job of jobs) {
    if (
      job.scene_id &&
      job.status === 'error' &&
      (job.kind === 'voice' || job.kind === 'final_clip') &&
      (job.retry_count ?? 0) >= 1
    ) {
      const existing = failedAudioByScene[job.scene_id];
      if (!existing || (job.created_at ?? '') > (existing.created_at ?? '')) {
        failedAudioByScene[job.scene_id] = job;
      }
    }
  }

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);

  // Phase 1.4.1: split readiness — video readiness drives button enablement,
  // final-clip readiness decides whether to fire directly or open the
  // confirm dialog (since silent fallback is now an explicit choice).
  const isSceneVideoReady = (s: (typeof scenes)[number]) => s.video_active_version_id !== null;
  const readySceneCount = scenes.filter(isSceneVideoReady).length;
  const allVideosReady = scenes.length > 0 && readySceneCount === scenes.length;
  const allScenesReady = allVideosReady; // legacy alias for button-label code below
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
    if (!allVideosReady) return;
    // Codex audit P1.3: the "audio not ready" confirm dialog used to fire
    // whenever any scene was missing final_clip. After the audio rip-out
    // new scenes never produce final_clip — native audio is baked into the
    // video clip directly — so the dialog would block every finalize on a
    // false alarm. Fire master concat unconditionally when video is ready.
    startTransition(async () => {
      const r = await generateMasterClipAction({ project_id: projectId });
      if (r.ok) {
        scrollToFinal();
      } else {
        if (r.error === 'tier_gate' && 'tier_gate' in r) {
          openTierGate({ kind: r.tier_gate.kind, required_tier: r.tier_gate.required_tier });
          return;
        }
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
            failedAudioJob={failedAudioByScene[scene.scene_id] ?? null}
            tier={scene.config_overrides?.tier ?? tier}
          />
        ))}
        {scenes.length === 0 && (
          <p className="scene-empty">Нет сцен. Сначала сгенерируй сценарий (Stage 03).</p>
        )}
      </div>

      <CostWarningToast projectId={projectId} jobs={jobs} />

      {/* FinalizeConfirmDialog removed 2026-05-13 with audio rip-out:
          its only purpose was to handle the "voice / final_clip not ready"
          branch, which can't fire anymore. */}
    </section>
  );
}
