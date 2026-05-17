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
  // Character lifecycle (1.2 + 1.3)
  | 'character_dossier'
  | 'character_avatar'
  | 'character_reference'
  // Character lifecycle (1.4): single-pose 1:1 reference image
  | 'character_reference_image'
  // Scene lifecycle: 1.3.0 names (kept for backward compat during 1.3.5 rollout)
  | 'first_frame'
  | 'video'
  | 'voice'
  | 'final_clip'
  | 'last_frame_extract'
  // Scene lifecycle: 1.3.5 names (preferred going forward)
  | 'scene_first_frame'
  | 'scene_video'
  | 'scene_voice'
  | 'scene_final_clip'
  // Master clip + storage mirror
  | 'master_clip'
  | 'storage_mirror';

/**
 * Inserts a media_jobs row in 'pending' state. Idempotent: when a unique-violation
 * occurs (an active job for the same (project_id, scene_id|character_id, kind)
 * tuple already exists), returns the existing job_id with `existing: true`.
 *
 * Used by internal chains (last_frame_extract dispatched from pollMediaJobs)
 * and helpers (reference_image chain) where the atomic-reservation flow doesn't
 * fit. User-facing actions that incur fal cost should use the
 * reserveMediaJob → finalizeMediaJobReservation pattern instead.
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
  retry_count?: number;
  delayed_until?: string | null;
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
      retry_count: params.retry_count ?? 0,
      delayed_until: params.delayed_until ?? null,
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

/**
 * Flip a `status='reserved'` placeholder row (created by `reserve_media_job`
 * RPC) into a fully-recorded `status='pending'` job. Called after provider.submit
 * succeeds; the row's model + fal_request_id + request_input are patched in.
 */
export async function finalizeMediaJobReservation(params: {
  job_id: string;
  model: string;
  fal_request_id: string;
  request_input: Record<string, unknown>;
  retry_count?: number;
  delayed_until?: string | null;
}): Promise<void> {
  const sb = await getServerSupabase();
  const update: Record<string, unknown> = {
    status: 'pending',
    model: params.model,
    fal_request_id: params.fal_request_id,
    request_input: params.request_input,
    updated_at: new Date().toISOString(),
  };
  if (params.retry_count !== undefined) update.retry_count = params.retry_count;
  if (params.delayed_until !== undefined) update.delayed_until = params.delayed_until;

  const { error } = await sb
    .from('media_jobs')
    .update(update as never)
    .eq('id', params.job_id)
    .eq('status', 'reserved');
  if (error) throw new Error(`finalizeMediaJobReservation failed: ${error.message}`);
}

/**
 * Drop a `status='reserved'` row when provider.submit fails. Frees the user's
 * quota slot so a failed fal call doesn't burn against their daily count.
 * Best-effort: errors are logged but not thrown — the underlying submit
 * failure is what the caller cares about. Stale orphans (e.g., process crash
 * mid-rollback) are reaped by `cleanup_stale_media_reservations` RPC.
 */
export async function rollbackMediaJobReservation(job_id: string): Promise<void> {
  if (!job_id) return;
  const sb = await getServerSupabase();
  const { error } = await sb.from('media_jobs').delete().eq('id', job_id).eq('status', 'reserved');
  if (error) {
    console.warn('[rollbackMediaJobReservation] cleanup failed', {
      job_id,
      error: error.message,
    });
  }
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
