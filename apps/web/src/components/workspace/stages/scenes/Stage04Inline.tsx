'use client';

import { usePollJobs } from '@/hooks/use-poll-jobs';
import { generateMasterClipAction } from '@/server/actions/generateMasterClipAction';
import '@/styles/storyboard-inline.css';
import type { Database } from '@mango/db';
import { useState, useTransition } from 'react';
import { CostMeter } from './CostMeter';
import { CostWarningToast } from './CostWarningToast';
import { MasterClipModal } from './MasterClipModal';
import { SceneCard } from './SceneCard';
import { Stage04Provider, type Stage04Script, useStage04 } from './Stage04Provider';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

interface Stage04InlineProps {
  projectId: string;
  tier: 'economy' | 'premium';
  initialScript?: Stage04Script | null;
}

function Stage04InlineInner({ projectId, tier }: Omit<Stage04InlineProps, 'initialScript'>) {
  const { script, jobs } = useStage04();
  const [showMaster, setShowMaster] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  usePollJobs(projectId);

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

  const readySceneCount = scenes.filter((s) => s.final_clip !== null).length;
  const allScenesReady = scenes.length > 0 && readySceneCount === scenes.length;
  const masterInFlight = jobs.some(
    (j) => j.kind === 'master_clip' && ['pending', 'running'].includes(j.status),
  );

  const handleMasterClick = () => {
    setMasterError(null);
    if (masterInFlight) return;
    if (activeMaster) {
      setShowMaster(true);
      return;
    }
    if (!allScenesReady) return;
    startTransition(async () => {
      const r = await generateMasterClipAction({ project_id: projectId });
      if (!r.ok) {
        setMasterError(r.error ?? 'не удалось запустить финализацию');
      }
    });
  };

  const masterButton = (() => {
    if (masterInFlight) {
      return {
        label: 'Финализирую…',
        disabled: true,
        title: 'Идёт сборка master_clip — это 10-30 секунд',
        busy: true,
        variant: 'busy' as const,
      };
    }
    if (activeMaster) {
      return {
        label: 'Открыть ролик',
        disabled: false,
        title: 'Готовый master_clip — открыть превью + скачать',
        busy: false,
        variant: 'ready' as const,
      };
    }
    if (!allScenesReady) {
      return {
        label: 'Финализировать ролик',
        disabled: true,
        title: `${readySceneCount}/${scenes.length} сцен готовы — нужно сгенерировать видео и финальные клипы для всех сцен`,
        busy: false,
        variant: 'idle' as const,
      };
    }
    return {
      label: pending ? 'Запускаю…' : 'Финализировать ролик',
      disabled: pending,
      title: 'Склеить все сцены в финальный ролик через ffmpeg (~$0.005)',
      busy: pending,
      variant: 'active' as const,
    };
  })();

  return (
    <section className="stage-04-inline">
      <header className="stage-04-header">
        <div className="stage-04-mark">
          <span className="stage-04-num">04</span>
          <div className="stage-04-mark-text">
            <h2 className="stage-04-title">Сцены</h2>
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
          </div>
        </div>
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
            <span className="master-btn-marker" aria-hidden>
              <span className="master-btn-dot" />
              <span className="master-btn-tag">MASTER</span>
            </span>
            <span className="master-btn-label">{masterButton.label}</span>
          </button>
        </div>
      </header>

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

      {showMaster && activeMaster && (
        <MasterClipModal
          masterClip={activeMaster}
          scenes={scenes}
          onClose={() => setShowMaster(false)}
        />
      )}
    </section>
  );
}

export function Stage04Inline({ projectId, tier, initialScript }: Stage04InlineProps) {
  return (
    <Stage04Provider projectId={projectId} initialScript={initialScript ?? null}>
      <Stage04InlineInner projectId={projectId} tier={tier} />
    </Stage04Provider>
  );
}
