'use client';

import type { MediaJobUiRow } from '@/lib/pickJobUiFields';
import type { ProspectivePromptMap } from '@/server/actions/buildProspectivePromptAction';
import type {
  AudioMode,
  Character,
  Dialogue,
  FirstFrameSource,
  MasterClipVersion,
  SceneAssetVersion,
  StoredAsset,
} from '@mango/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type { MediaJobUiRow };

/**
 * Client-side mirror of the persisted Scene shape (Phase 1.3.5).
 * The canonical schema lives in `@mango/core/llm/schemas.ts` but is `server-only`,
 * so client code cannot import its inferred type. We re-declare the shape here.
 */
export interface SceneView {
  scene_id: string;
  description: string;
  dialogue: Dialogue | null;
  character_ids: string[];
  duration_sec: number;
  config_overrides?: {
    tier?: 'economy' | 'premium';
    model?: string;
  };
  audio_mode: AudioMode;
  first_frame_source: FirstFrameSource;

  first_frame_versions: SceneAssetVersion[];
  first_frame_active_version_id: string | null;
  video_versions: SceneAssetVersion[];
  video_active_version_id: string | null;
  voice_audio_versions: SceneAssetVersion[];
  voice_audio_active_version_id: string | null;

  last_frame: {
    storage: StoredAsset;
    extracted_from_version_id: string;
  } | null;
  final_clip: {
    storage: StoredAsset;
    composed_from: {
      video_version_id: string;
      voice_audio_version_id: string | null;
    };
  } | null;
}

export interface Stage04Script {
  title: string;
  scenes: SceneView[];
  characters: Character[];
  master_clip_versions?: MasterClipVersion[];
  master_clip_active_version_id?: string | null;
}

interface ScriptState {
  projectId: string;
  script: Stage04Script | null;
  jobs: MediaJobUiRow[];
  /**
   * Per-scene byte-for-byte preview of the prompt that would be sent to fal
   * on the next "Create frame" / "Create video" click. Populated by
   * buildAllProspectivePromptsAction after every script refresh; null until
   * the first batch lands. SceneSidePanel reads from this map when no active
   * version exists yet so the user sees + edits the prompt before generation.
   */
  prospectivePrompts: ProspectivePromptMap | null;
  setScript: (script: Stage04Script | null) => void;
  setProspectivePrompts: (prompts: ProspectivePromptMap | null) => void;
  upsertJob: (job: MediaJobUiRow) => void;
  removeJob: (jobId: string) => void;
}

const ScriptStateContext = createContext<ScriptState | null>(null);

const REALTIME_GRACE_MS = 5_000;

/**
 * True when the fresh script proves the inflight row is obsolete. Used by
 * the jobs sync effect to prune stale realtime rows that the terminal-status
 * callback failed to clean up.
 */
function isContradictedByScript(job: MediaJobUiRow, script: Stage04Script | null): boolean {
  if (!script) return false;
  // master_clip jobs have scene_id=null by design — check them before the
  // scene-scoped rules below so a settled master version can prune a stale
  // master_clip row left over after a missed terminal callback.
  //
  // Compare timestamps: the job is contradicted only when the active master
  // was generated AFTER the job was created. Without this, a legitimate
  // re-finalize pending job (active master still M1, user clicked again
  // creating M2-pending) would be wrongly pruned because the script still
  // points at M1. Codex audit finding 2026-05-25 on PR #56.
  if (job.kind === 'master_clip') {
    const activeId = script.master_clip_active_version_id;
    if (!activeId) return false;
    const active = (script.master_clip_versions ?? []).find((v) => v.version_id === activeId);
    if (!active) return false;
    const activeMs = active.generated_at ? new Date(active.generated_at).getTime() : 0;
    const jobMs = job.created_at ? new Date(job.created_at).getTime() : 0;
    return activeMs > jobMs;
  }
  if (!job.scene_id) return false;
  const scene = script.scenes.find((s) => s.scene_id === job.scene_id);
  if (!scene) return true;
  if (job.kind === 'video' && scene.video_active_version_id) return true;
  if (
    (job.kind === 'first_frame' || job.kind === 'scene_first_frame') &&
    scene.first_frame_active_version_id
  )
    return true;
  if (job.kind === 'voice' && scene.voice_audio_active_version_id) return true;
  if (job.kind === 'final_clip' && scene.final_clip) return true;
  return false;
}

interface Props {
  projectId: string;
  initialScript?: Stage04Script | null;
  initialJobs?: MediaJobUiRow[];
  children: React.ReactNode;
}

export function ScriptStateProvider({
  projectId,
  initialScript = null,
  initialJobs = [],
  children,
}: Props) {
  const [script, setScript] = useState<Stage04Script | null>(initialScript);
  const [jobs, setJobs] = useState<MediaJobUiRow[]>(initialJobs);
  const [prospectivePrompts, setProspectivePrompts] = useState<ProspectivePromptMap | null>(null);

  // Bug 1: re-sync script when ProjectJobsPoller triggers router.refresh()
  // and page.tsx re-passes the prop with the latest DB snapshot.
  useEffect(() => {
    setScript(initialScript);
  }, [initialScript]);

  // Bug 1: jobs sync — RSC-authoritative, with a brief grace window for
  // realtime-only rows that haven't yet propagated to the RSC fetch, and
  // script-driven pruning to defend against missed terminal callbacks.
  useEffect(() => {
    setJobs((prev) => {
      const now = Date.now();
      const byId = new Map<string, MediaJobUiRow>();
      for (const j of initialJobs) byId.set(j.id, j);
      for (const j of prev) {
        if (byId.has(j.id)) continue;
        const createdMs = j.created_at ? new Date(j.created_at).getTime() : 0;
        if (now - createdMs > REALTIME_GRACE_MS) continue;
        if (isContradictedByScript(j, initialScript)) continue;
        byId.set(j.id, j);
      }
      return Array.from(byId.values());
    });
  }, [initialJobs, initialScript]);

  const upsertJob = useCallback((job: MediaJobUiRow) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === job.id);
      if (idx === -1) return [...prev, job];
      const next = [...prev];
      next[idx] = job;
      return next;
    });
  }, []);

  const removeJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const value = useMemo(
    () => ({
      projectId,
      script,
      jobs,
      prospectivePrompts,
      setScript,
      setProspectivePrompts,
      upsertJob,
      removeJob,
    }),
    [projectId, script, jobs, prospectivePrompts, upsertJob, removeJob],
  );

  return <ScriptStateContext.Provider value={value}>{children}</ScriptStateContext.Provider>;
}

export function useScriptState(): ScriptState {
  const ctx = useContext(ScriptStateContext);
  if (!ctx) throw new Error('useScriptState must be used inside ScriptStateProvider');
  return ctx;
}
