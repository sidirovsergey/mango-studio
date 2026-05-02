'use client';

import '@/styles/storyboard.css';

import type { Character, MasterClip, Scene } from '@mango/core';
import type { Database } from '@mango/db';
import { useState } from 'react';
import { MasterClipModal } from './MasterClipModal';
import { SceneCard } from './SceneCard';
import { Stage04Provider, useStage04 } from './Stage04Provider';
import { StoryboardBottomBar } from './StoryboardBottomBar';
import { StoryboardHeader } from './StoryboardHeader';
import { usePollJobs } from './use-poll-jobs';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];
type SceneWithOverrides = Scene & { config_overrides?: { model?: string } };

interface StoryboardClientInnerProps {
  projectId: string;
  tier: 'economy' | 'premium';
}

function StoryboardClientInner({ projectId, tier }: StoryboardClientInnerProps) {
  const { script, jobs } = useStage04();
  const [showMaster, setShowMaster] = useState(false);

  usePollJobs(projectId);

  const scenes = (script?.scenes ?? []) as SceneWithOverrides[];
  const characters = (script?.characters ?? []) as Character[];
  const masterClip = (script as { master_clip?: MasterClip | null } | null)?.master_clip ?? null;

  // Map scene_id -> active job for that scene (pending or running)
  const jobsByScene: Record<string, MediaJobRow> = {};
  for (const job of jobs) {
    if (job.scene_id && ['pending', 'running'].includes(job.status)) {
      // Last write wins — if multiple active, show latest
      if (
        !jobsByScene[job.scene_id] ||
        (job.created_at ?? '') > (jobsByScene[job.scene_id]!.created_at ?? '')
      ) {
        jobsByScene[job.scene_id] = job;
      }
    }
  }

  return (
    <div className="storyboard-page">
      <StoryboardHeader
        projectId={projectId}
        title={script?.title ?? 'Storyboard'}
        scenes={scenes}
        jobs={jobs}
        masterClip={masterClip}
        onOpenMaster={() => setShowMaster(true)}
      />

      <div className="storyboard-strip">
        {scenes.map((scene, index) => (
          <SceneCard
            key={scene.scene_id}
            projectId={projectId}
            scene={scene}
            index={index}
            characters={characters}
            activeJob={jobsByScene[scene.scene_id] ?? null}
            tier={tier}
          />
        ))}
        {scenes.length === 0 && (
          <div className="storyboard-empty">Нет сцен. Сначала сгенерируй сценарий.</div>
        )}
      </div>

      <StoryboardBottomBar tier={tier} />

      {showMaster && masterClip && (
        <MasterClipModal
          masterClip={masterClip}
          scenes={scenes}
          onClose={() => setShowMaster(false)}
        />
      )}
    </div>
  );
}

interface StoryboardClientProps {
  projectId: string;
  tier: 'economy' | 'premium';
  initialScript: { title: string; scenes: SceneWithOverrides[]; characters: unknown[] } | null;
  initialJobs: MediaJobRow[];
}

export function StoryboardClient({
  projectId,
  tier,
  initialScript,
  initialJobs,
}: StoryboardClientProps) {
  return (
    <Stage04Provider initialScript={initialScript} initialJobs={initialJobs}>
      <StoryboardClientInner projectId={projectId} tier={tier} />
    </Stage04Provider>
  );
}
