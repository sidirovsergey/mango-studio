'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import type { PersistedScript, StoredAsset } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
});

type Input = z.infer<typeof InputSchema>;

function urlOfStorage(storage: StoredAsset): string {
  if (storage.kind === 'fal_passthrough') {
    return storage.url;
  }
  // supabase — TODO: real signed URL (out of scope)
  return `supabase://${storage.path}`;
}

export async function generateMasterClipAction(
  rawInput: unknown,
): Promise<{ ok: true; job_id: string; existing: boolean } | { ok: false; error: string }> {
  let input: Input;
  try {
    input = InputSchema.parse(rawInput);
  } catch {
    return { ok: false, error: 'invalid input' };
  }

  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

  const sb = await getServerSupabase();

  const { data: project, error } = await sb
    .from('projects')
    .select('id, user_id, tier, script')
    .eq('id', input.project_id)
    .single();

  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const script = project.script as unknown as PersistedScript;
  if (!script) return { ok: false, error: 'project has no script' };

  const allHaveFinalClip = script.scenes.every((s) => s.final_clip !== null);
  if (!allHaveFinalClip) {
    return { ok: false, error: 'not all scenes have final_clip yet' };
  }

  const clip_urls = script.scenes.map((s) => urlOfStorage(s.final_clip!.storage));

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  const handle = await provider.submitMasterConcat({ clip_urls }, ctx);

  // master_clip is project-level — no scene_id or character_id
  // covered by media_jobs_master_active unique partial index on (project_id, kind) WHERE kind='master_clip'
  const { job_id, existing } = await recordPendingJob({
    user_id: user.id,
    project_id: input.project_id,
    kind: 'master_clip',
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    request_input: handle.request_input,
  });

  return { ok: true, job_id, existing };
}
