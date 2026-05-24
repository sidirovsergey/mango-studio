'use client';

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
import { type MediaJobUiRow } from '@/lib/pickJobUiFields';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

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
