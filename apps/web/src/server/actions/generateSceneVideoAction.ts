'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type PersistedScript,
  type Tier,
  buildVideoPrompt,
  clampDurationToModel,
  getDefaultVideoModel,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  model_override: z.string().optional(),
});

type Input = z.infer<typeof InputSchema>;

export async function generateSceneVideoAction(
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
    .select('id, user_id, tier, script, style')
    .eq('id', input.project_id)
    .single();

  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const script = project.script as unknown as PersistedScript;
  if (!script) return { ok: false, error: 'project has no script' };

  const tier = (project.tier ?? 'economy') as Tier;

  const scene = script.scenes.find((s) => s.scene_id === input.scene_id);
  if (!scene) return { ok: false, error: 'scene not found' };

  if (!scene.first_frame) {
    return { ok: false, error: 'scene requires a first_frame before generating video' };
  }

  const model = input.model_override ?? getDefaultVideoModel(tier);
  const duration_sec = clampDurationToModel(model, scene.duration_sec);

  const { prompt, image_refs, aspect_ratio } = buildVideoPrompt({
    scene: { ...scene, duration_sec },
    first_frame_storage: scene.first_frame.storage,
    model,
  });

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  const handle = await provider.submitSceneVideo(
    {
      prompt,
      model,
      first_frame_ref: image_refs[0]!,
      duration_sec,
      aspect_ratio,
    },
    ctx,
  );

  const { job_id, existing } = await recordPendingJob({
    user_id: user.id,
    project_id: input.project_id,
    scene_id: input.scene_id,
    kind: 'video',
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    request_input: handle.request_input,
  });

  return { ok: true, job_id, existing };
}
