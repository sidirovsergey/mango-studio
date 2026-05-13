'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { submitFinalClipJob, submitVoiceJob } from '@/server/lib/audio-chain-helpers';
import {
  type Character,
  type SceneAssetVersion,
  type StoredAsset,
  type Tier,
  getVideoModelMeta,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  kind: z.enum(['voice', 'final_clip']),
});

type Input = z.infer<typeof InputSchema>;

type SceneShape = Record<string, unknown> & {
  scene_id: string;
  audio_mode?: 'native' | 'silent_tts' | 'auto';
  dialogue?: { speaker: string; text: string } | null;
  config_overrides?: { tier?: Tier; model?: string };
  video_versions?: SceneAssetVersion[];
  video_active_version_id?: string | null;
  voice_audio_versions?: SceneAssetVersion[];
  voice_audio_active_version_id?: string | null;
};

type ScriptShape = {
  scenes: SceneShape[];
  characters?: Character[];
  narrator_voice?: {
    tts_voice_id: string;
    description?: string;
    stability?: number;
    similarity_boost?: number;
    style?: number;
    speed?: number;
  };
};

/**
 * Manually re-fire a voice or final_clip job for a scene. Used by the
 * thumbnail column's retry button after retry_count is exhausted, and
 * by the Director's compose_scene_final_clip tool.
 */
export async function retrySceneAudioAction(
  rawInput: unknown,
): Promise<{ ok: true; job_id?: string } | { ok: false; error: string }> {
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

  const script = project.script as unknown as ScriptShape;
  if (!script) return { ok: false, error: 'project has no script' };

  const scene = script.scenes.find((s) => s.scene_id === input.scene_id);
  if (!scene) return { ok: false, error: 'scene not found' };

  const projectTier = (project.tier ?? 'economy') as Tier;
  const effectiveTier = scene.config_overrides?.tier ?? projectTier;

  if (input.kind === 'voice') {
    if (!scene.dialogue?.text) return { ok: false, error: 'scene has no dialogue' };
    const r = await submitVoiceJob({
      user_id: user.id,
      project_id: input.project_id,
      scene_id: input.scene_id,
      dialogue: scene.dialogue,
      characters: script.characters ?? [],
      narrator_voice: script.narrator_voice ?? null,
      effective_tier: effectiveTier,
      video_model_id: scene.config_overrides?.model,
      initial_retry_count: 0,
    });
    return r.ok ? { ok: true, job_id: r.job_id } : { ok: false, error: r.error };
  }

  // final_clip retry
  const activeVideo = scene.video_versions?.find(
    (v) => v.version_id === scene.video_active_version_id,
  );
  if (!activeVideo) return { ok: false, error: 'scene has no active video' };
  const activeVoice = scene.voice_audio_versions?.find(
    (v) => v.version_id === scene.voice_audio_active_version_id,
  );
  const meta = getVideoModelMeta(activeVideo.model ?? scene.config_overrides?.model ?? '');
  const r = await submitFinalClipJob({
    user_id: user.id,
    project_id: input.project_id,
    scene_id: input.scene_id,
    video_version: {
      version_id: activeVideo.version_id,
      storage: activeVideo.storage as StoredAsset,
      has_native_audio: meta?.has_native_audio ?? false,
    },
    voice_version: activeVoice
      ? {
          version_id: activeVoice.version_id,
          storage: activeVoice.storage as StoredAsset,
        }
      : null,
    initial_retry_count: 0,
    current_script: script as unknown as {
      scenes: Array<Record<string, unknown> & { scene_id: string }>;
    },
  });
  if (!r.ok) return { ok: false, error: r.error };
  return r.mode === 'native_passthrough' ? { ok: true } : { ok: true, job_id: r.job_id };
}
