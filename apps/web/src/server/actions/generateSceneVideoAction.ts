'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type SceneAssetVersion,
  type Tier,
  buildVideoPrompt,
  clampDurationToModel,
  getActiveVersion,
  getDefaultVideoModel,
  getVideoModelMeta,
  resolveAudioMode,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  model_override: z.string().optional(),
  prompt_override: z.string().min(1).optional(),
});

type Input = z.infer<typeof InputSchema>;

type SceneShape = {
  scene_id: string;
  description: string;
  duration_sec: number;
  dialogue: { speaker: string; text: string } | null;
  character_ids: string[];
  first_frame_source?: 'auto_continuity' | 'manual_text2img' | 'user_upload';
  audio_mode?: 'native' | 'silent_tts' | 'auto';
  first_frame_versions?: SceneAssetVersion[];
  first_frame_active_version_id?: string | null;
  config_overrides?: { tier?: Tier; model?: string };
};

export async function generateSceneVideoAction(
  rawInput: unknown,
): Promise<
  | { ok: true; job_id: string; existing: boolean; audio_mode: 'native' | 'silent_tts' }
  | { ok: false; error: string }
> {
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

  const script = project.script as unknown as { scenes: SceneShape[] };
  if (!script) return { ok: false, error: 'project has no script' };

  const projectTier = (project.tier ?? 'economy') as Tier;

  const scene = script.scenes.find((s) => s.scene_id === input.scene_id);
  if (!scene) return { ok: false, error: 'scene not found' };

  // Phase 1.3.5: use the active first_frame version as continuity ref.
  const activeFrame = getActiveVersion({
    versions: scene.first_frame_versions ?? [],
    active_version_id: scene.first_frame_active_version_id ?? null,
  });
  if (!activeFrame) {
    return { ok: false, error: 'scene requires a first_frame before generating video' };
  }

  // Resolve effective tier + model (scene config_overrides win).
  const effectiveTier = scene.config_overrides?.tier ?? projectTier;
  const model =
    input.model_override ?? scene.config_overrides?.model ?? getDefaultVideoModel(effectiveTier);
  const duration_sec = clampDurationToModel(model, scene.duration_sec);

  // Resolve effective audio mode (drives whether silent_tts pipeline will follow).
  const modelMeta = getVideoModelMeta(model);
  const audioMode = resolveAudioMode(
    {
      audio_mode: scene.audio_mode ?? 'auto',
      dialogue: scene.dialogue,
    },
    { has_native_audio: modelMeta?.has_native_audio ?? false },
  );

  const built = buildVideoPrompt({
    scene: { ...scene, duration_sec } as never,
    first_frame_storage: activeFrame.storage,
    model,
  });
  const prompt = input.prompt_override ?? built.prompt;
  const { image_refs, aspect_ratio } = built;

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
    request_input: {
      ...(handle.request_input ?? {}),
      audio_mode: audioMode,
      first_frame_version_id: activeFrame.version_id,
    },
  });

  return { ok: true, job_id, existing, audio_mode: audioMode };
}
