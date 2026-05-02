'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
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

export async function retryMediaJobAction(
  input: { job_id: string },
): Promise<{ ok: true; new_job_id: string } | { ok: false; error: string }> {
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
  const handle = await submitFn.call(provider, old.request_input, ctx);

  await sb.from('media_jobs').update({ status: 'superseded' }).eq('id', old.id);

  const { data: newRow, error: insErr } = await sb
    .from('media_jobs')
    .insert({
      user_id: user.id,
      project_id: old.project_id,
      scene_id: old.scene_id,
      character_id: old.character_id,
      kind: old.kind,
      model: handle.model_used,
      fal_request_id: handle.fal_request_id,
      status: 'pending',
      request_input: handle.request_input as never,
    })
    .select('id')
    .single();
  if (insErr || !newRow) return { ok: false, error: insErr?.message ?? 'insert failed' };
  return { ok: true, new_job_id: newRow.id };
}
