'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { submitVoiceJob } from '@/server/lib/audio-chain-helpers';
import { type Character, type Tier, getVideoModelMeta, resolveAudioMode } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
});

type Input = z.infer<typeof InputSchema>;

type SceneShape = {
  scene_id: string;
  duration_sec: number;
  dialogue: { speaker: string; text: string } | null;
  audio_mode?: 'native' | 'silent_tts' | 'auto';
  config_overrides?: { tier?: Tier; model?: string };
};

type ScriptShape = {
  scenes: SceneShape[];
  characters: Character[];
  narrator_voice?: {
    tts_voice_id: string;
    description?: string;
    stability?: number;
    similarity_boost?: number;
    style?: number;
    speed?: number;
  };
};

export async function generateSceneVoiceAction(
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

  const script = project.script as unknown as ScriptShape;
  if (!script) return { ok: false, error: 'project has no script' };

  const projectTier = (project.tier ?? 'economy') as Tier;
  const scene = script.scenes.find((s) => s.scene_id === input.scene_id);
  if (!scene) return { ok: false, error: 'scene not found' };

  if (!scene.dialogue || !scene.dialogue.text) {
    return { ok: false, error: 'scene has no dialogue' };
  }

  // Honour audio_mode override: refuse one-shot TTS for native scenes — caller
  // explicitly opted out via UI control.
  const effectiveTier = scene.config_overrides?.tier ?? projectTier;
  const videoMeta = getVideoModelMeta(scene.config_overrides?.model ?? '');
  const audioMode = resolveAudioMode(
    { audio_mode: scene.audio_mode ?? 'auto', dialogue: scene.dialogue },
    { has_native_audio: videoMeta?.has_native_audio ?? false },
  );
  if (audioMode === 'native') {
    return { ok: false, error: 'scene uses native audio — no TTS pipeline needed' };
  }

  return submitVoiceJob({
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
}
