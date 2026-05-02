import 'server-only';
import type {
  MasterClip,
  SceneAsset,
  SceneVideoAsset,
  ScriptGenOutput,
  VoiceAsset,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';

type Script = ScriptGenOutput;

export type MediaJobKind =
  | 'character_dossier'
  | 'character_reference'
  | 'first_frame'
  | 'video'
  | 'last_frame_extract'
  | 'voice'
  | 'final_clip'
  | 'master_clip';

/**
 * Inserts a media_jobs row in 'pending' state. Idempotent: when a unique-violation
 * occurs (an active job for the same (project_id, scene_id|character_id, kind)
 * tuple already exists), returns the existing job_id with `existing: true`.
 */
export async function recordPendingJob(params: {
  user_id: string;
  project_id: string;
  scene_id?: string;
  character_id?: string;
  kind: MediaJobKind;
  model: string;
  fal_request_id: string;
  request_input: Record<string, unknown>;
}): Promise<{ job_id: string; existing: boolean }> {
  const sb = await getServerSupabase();
  const { data, error } = await sb
    .from('media_jobs')
    .insert({
      user_id: params.user_id,
      project_id: params.project_id,
      scene_id: params.scene_id ?? null,
      character_id: params.character_id ?? null,
      kind: params.kind,
      model: params.model,
      fal_request_id: params.fal_request_id,
      status: 'pending',
      request_input: params.request_input as never,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      // unique partial index media_jobs_character_active — fetch the existing active row
      const filterCol = params.scene_id ? 'scene_id' : 'character_id';
      const filterVal = params.scene_id ?? params.character_id!;
      const { data: existing } = await sb
        .from('media_jobs')
        .select('id')
        .eq('project_id', params.project_id)
        .eq(filterCol, filterVal)
        .eq('kind', params.kind)
        .in('status', ['pending', 'running'])
        .limit(1)
        .single();
      if (existing) return { job_id: existing.id, existing: true };
    }
    throw new Error(`recordPendingJob failed: ${error.message}`);
  }

  return { job_id: data.id, existing: false };
}

interface AssetApplication {
  scene_id: string;
  kind: 'first_frame' | 'last_frame' | 'video' | 'voice_audio' | 'final_clip';
  asset: SceneAsset | SceneVideoAsset | VoiceAsset;
}

/**
 * Returns a copy of `script` with the given asset applied to scene[scene_id].
 * Throws when scene_id is not found.
 */
export function applyAssetToScript(script: Script, app: AssetApplication): Script {
  const idx = script.scenes.findIndex((s) => s.scene_id === app.scene_id);
  if (idx === -1) throw new Error(`scene not found: ${app.scene_id}`);
  const scene = script.scenes[idx]!;
  const updatedScene = { ...scene, [app.kind]: app.asset };
  const scenes = [...script.scenes];
  scenes[idx] = updatedScene as (typeof scenes)[number];
  return { ...script, scenes };
}

/** Returns a copy of `script` with the given master_clip set on the root. */
export function applyMasterClipToScript(script: Script, master: MasterClip): Script {
  return { ...script, master_clip: master };
}

/**
 * When scene[video_scene_id]'s video changes, scene[next].first_frame becomes
 * stale (continuity ref now points to an out-of-date last_frame). Marks the
 * stale flag silently — does NOT auto-regenerate.
 */
export function cascadeFirstFrameStale(script: Script, video_scene_id: string): Script {
  const idx = script.scenes.findIndex((s) => s.scene_id === video_scene_id);
  if (idx === -1 || idx >= script.scenes.length - 1) return script;
  const next = script.scenes[idx + 1]!;
  if (!next.first_frame) return script;
  const scenes = [...script.scenes];
  scenes[idx + 1] = {
    ...next,
    first_frame: { ...next.first_frame, stale: true },
  };
  return { ...script, scenes };
}

/**
 * True when master_clip exists but its scene_ids_snapshot drifted from current
 * scenes, OR any scene's final_clip was regenerated after the master clip.
 */
export function isMasterClipStale(script: Script): boolean {
  if (!script.master_clip) return false;
  const current = script.scenes
    .map((s) => s.scene_id)
    .sort()
    .join(',');
  const snap = [...script.master_clip.scene_ids_snapshot].sort().join(',');
  if (current !== snap) return true;
  const masterTs = new Date(script.master_clip.generated_at).getTime();
  return script.scenes.some((s) => {
    if (!s.final_clip) return false;
    return new Date(s.final_clip.generated_at).getTime() > masterTs;
  });
}
