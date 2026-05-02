import 'server-only';
import { getServiceRoleSupabase } from '@mango/db/server';

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
  const sb = getServiceRoleSupabase();
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
