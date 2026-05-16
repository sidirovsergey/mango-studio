'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { reserveMediaJob } from '@/server/lib/rate-limit';
import {
  type MediaJobKind,
  finalizeMediaJobReservation,
  recordPendingJob,
  rollbackMediaJobReservation,
} from '@/server/lib/scene-helpers';
import type { AssetContext, MediaProvider } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';

const KIND_TO_SUBMIT: Record<string, keyof MediaProvider> = {
  character_dossier: 'submitCharacterDossier',
  character_reference: 'submitCharacterDossier',
  first_frame: 'submitFirstFrame',
  video: 'submitSceneVideo',
  voice: 'submitVoice',
  final_clip: 'submitFinalClipMux',
  master_clip: 'submitMasterConcat',
  last_frame_extract: 'submitLastFrameExtract',
};

export async function retryMediaJobAction(input: { job_id: string }): Promise<
  { ok: true; new_job_id: string } | { ok: false; error: string }
> {
  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

  const sb = await getServerSupabase();

  const { data: old, error } = await sb
    .from('media_jobs')
    .select('*')
    .eq('id', input.job_id)
    .single();
  if (error || !old) return { ok: false, error: 'job not found' };
  if (old.user_id !== user.id) return { ok: false, error: 'forbidden' };
  if (old.status !== 'error') {
    return { ok: false, error: 'only error jobs can be retried' };
  }

  const provider = getMediaProvider();
  const submitMethod = KIND_TO_SUBMIT[old.kind];
  if (!submitMethod) return { ok: false, error: `unsupported kind: ${old.kind}` };

  // Atomic quota + reservation. Old job's status='error' is OUTSIDE the unique
  // partial index predicate ('pending'/'running'), and reserve_media_job inserts
  // with status='reserved' which is also outside the predicate — so there's no
  // index conflict. Defer the supersede until AFTER finalize succeeds so a
  // failed retry leaves the original 'error' job retryable.
  const reservation = await reserveMediaJob({
    user_id: user.id,
    project_id: old.project_id,
    kind: old.kind as MediaJobKind,
    scene_id: old.scene_id ?? undefined,
    character_id: old.character_id ?? undefined,
  });
  if (!reservation.ok) return { ok: false, error: reservation.error };
  if (reservation.mode === 'reserved' && reservation.dedup) {
    return { ok: true, new_job_id: reservation.job_id };
  }

  const ctx: AssetContext = {
    user_id: user.id,
    project_id: old.project_id,
    character_id: old.character_id ?? old.scene_id ?? '',
  };
  const submitFn = provider[submitMethod] as (
    input: unknown,
    ctx: AssetContext,
  ) => Promise<{
    fal_request_id: string;
    model_used: string;
    request_input: Record<string, unknown>;
  }>;

  let handle: Awaited<ReturnType<typeof submitFn>>;
  try {
    handle = await submitFn.call(provider, old.request_input, ctx);
  } catch (e) {
    if (reservation.mode === 'reserved') {
      await rollbackMediaJobReservation(reservation.job_id);
    }
    // Old 'error' job intentionally left as-is so the user can retry again.
    throw e;
  }

  let new_job_id: string;
  if (reservation.mode === 'reserved') {
    await finalizeMediaJobReservation({
      job_id: reservation.job_id,
      model: handle.model_used,
      fal_request_id: handle.fal_request_id,
      request_input: handle.request_input,
    });
    new_job_id = reservation.job_id;
  } else {
    // Bypass mode.
    const recorded = await recordPendingJob({
      user_id: user.id,
      project_id: old.project_id,
      scene_id: old.scene_id ?? undefined,
      character_id: old.character_id ?? undefined,
      kind: old.kind as MediaJobKind,
      model: handle.model_used,
      fal_request_id: handle.fal_request_id,
      request_input: handle.request_input,
    });
    new_job_id = recorded.job_id;
  }

  // Now (and only now) supersede the old 'error' job. If this update fails,
  // the worst outcome is two rows describing the same retry — non-destructive.
  await sb.from('media_jobs').update({ status: 'superseded' }).eq('id', old.id);

  return { ok: true, new_job_id };
}
