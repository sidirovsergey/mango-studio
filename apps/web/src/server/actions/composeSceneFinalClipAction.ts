'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import type { PersistedScript, StoredAsset } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
});

type Input = z.infer<typeof InputSchema>;

function urlOfStorage(storage: StoredAsset): string {
  if (storage.kind === 'fal_passthrough') {
    return storage.url;
  }
  // supabase — TODO: real signed URL (out of scope)
  return `supabase://${storage.path}`;
}

export async function composeSceneFinalClipAction(
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

  const scene = script.scenes.find((s) => s.scene_id === input.scene_id);
  if (!scene) return { ok: false, error: 'scene not found' };

  if (scene.video?.has_native_audio) {
    return {
      ok: false,
      error: 'native-audio model; final_clip is already the video',
    };
  }

  if (!scene.video) {
    return { ok: false, error: 'scene has no video yet' };
  }

  if (!scene.voice_audio) {
    return { ok: false, error: 'scene has no voice_audio yet' };
  }

  const video_url = urlOfStorage(scene.video.storage);
  const audio_url = urlOfStorage(scene.voice_audio.storage);

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  const handle = await provider.submitFinalClipMux({ video_url, audio_url }, ctx);

  const { job_id, existing } = await recordPendingJob({
    user_id: user.id,
    project_id: input.project_id,
    scene_id: input.scene_id,
    kind: 'final_clip',
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    request_input: handle.request_input,
  });

  return { ok: true, job_id, existing };
}
