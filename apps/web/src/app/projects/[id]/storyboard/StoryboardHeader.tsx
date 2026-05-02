'use client';

import {
  generateAllFirstFramesAction,
} from '@/server/actions/generateFirstFrameAction';
import { generateMasterClipAction } from '@/server/actions/generateMasterClipAction';
import type { MasterClip, Scene } from '@mango/core';
import type { Database } from '@mango/db';
import { useTransition } from 'react';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

type SceneWithOverrides = Scene & { config_overrides?: { model?: string } };

interface StoryboardHeaderProps {
  projectId: string;
  title: string;
  scenes: SceneWithOverrides[];
  jobs: MediaJobRow[];
  masterClip: MasterClip | null;
  onOpenMaster: () => void;
}

function countJobsByKind(jobs: MediaJobRow[], kind: string, status: string | string[]) {
  const statuses = Array.isArray(status) ? status : [status];
  return jobs.filter((j) => j.kind === kind && statuses.includes(j.status)).length;
}

export function StoryboardHeader({
  projectId,
  title,
  scenes,
  jobs,
  masterClip,
  onOpenMaster,
}: StoryboardHeaderProps) {
  const [isPendingBulk, startBulk] = useTransition();
  const [isPendingMaster, startMaster] = useTransition();

  const total = scenes.length;
  const firstFrameCount = scenes.filter((s) => s.first_frame != null).length;
  const videoCount = scenes.filter((s) => s.video != null).length;
  const finalCount = scenes.filter((s) => s.final_clip != null).length;

  // Count active (pending/running) jobs
  const activeFirstFrames = countJobsByKind(jobs, 'first_frame', ['pending', 'running']);
  const activeVideos = countJobsByKind(jobs, 'video', ['pending', 'running']);
  const activeFinals = countJobsByKind(jobs, 'final_clip', ['pending', 'running']);

  // Total cost = sum of completed jobs
  const totalCost = jobs
    .filter((j) => j.status === 'completed' && j.cost_usd != null)
    .reduce((s, j) => s + Number(j.cost_usd ?? 0), 0);

  const allFinalReady = total > 0 && scenes.every((s) => s.final_clip != null);

  const handleBulkFirstFrames = () => {
    startBulk(async () => {
      await generateAllFirstFramesAction({ project_id: projectId });
    });
  };

  const handleGenerateMaster = () => {
    startMaster(async () => {
      await generateMasterClipAction({ project_id: projectId });
    });
  };

  return (
    <header className="storyboard-header">
      <h2 className="storyboard-title">{title}</h2>

      <div className="storyboard-counters">
        <span className="counter-item" title="Первые кадры">
          🖼 {firstFrameCount}/{total}
          {activeFirstFrames > 0 && <span className="counter-active"> ({activeFirstFrames}↻)</span>}
        </span>
        <span className="counter-item" title="Видео">
          🎬 {videoCount}/{total}
          {activeVideos > 0 && <span className="counter-active"> ({activeVideos}↻)</span>}
        </span>
        <span className="counter-item" title="Финальные клипы">
          🎞 {finalCount}/{total}
          {activeFinals > 0 && <span className="counter-active"> ({activeFinals}↻)</span>}
        </span>
        {totalCost > 0 && (
          <span className="counter-item counter-cost" title="Потрачено">
            💰 ${totalCost.toFixed(3)}
          </span>
        )}
      </div>

      <div className="storyboard-actions">
        <button
          type="button"
          className="bulk-cta"
          onClick={handleBulkFirstFrames}
          disabled={isPendingBulk}
          title="Запустить генерацию первых кадров для всех сцен (макс. 5)"
        >
          {isPendingBulk ? '...' : '▶ Первые кадры (5)'}
        </button>

        {masterClip ? (
          <button
            type="button"
            className="master-cta master-cta--open"
            onClick={onOpenMaster}
          >
            🎥 Открыть мастер
          </button>
        ) : (
          <button
            type="button"
            className="master-cta"
            onClick={handleGenerateMaster}
            disabled={isPendingMaster || !allFinalReady}
            title={!allFinalReady ? 'Нужны все финальные клипы' : 'Собрать мастер-клип'}
          >
            {isPendingMaster ? '...' : '🎬 Собрать мастер'}
          </button>
        )}
      </div>
    </header>
  );
}
