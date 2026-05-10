'use client';

import { usePollJobs } from '@/hooks/use-poll-jobs';
import '@/styles/storyboard-inline.css';
import type { Database } from '@mango/db';
import { useState } from 'react';
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

  return (
    <section className="stage-04-inline">
      <header className="stage-04-header">
        <div className="stage-title">
          <span className="stage-num">04</span>
          <span>Сцены</span>
        </div>
        <div className="stage-sub">
          {scenes.length} сцен · {totalDuration}с · {tier === 'premium' ? 'Премиум' : 'Эконом'}
        </div>
        <div className="stage-04-cluster">
          <CostMeter projectId={projectId} />
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowMaster(true)}
            disabled={!activeMaster}
          >
            🎬 Финализировать ролик
          </button>
        </div>
      </header>

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

      <CostWarningToast projectId={projectId} />

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
