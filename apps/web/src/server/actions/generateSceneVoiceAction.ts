'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type Character,
  type Tier,
  getDefaultVideoModel,
  getDefaultVoiceModel,
  getVideoModelMeta,
  resolveAudioMode,
  resolveVoiceId,
  resolveVoiceSettings,
} from '@mango/core';
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

  // Resolve effective audio mode using the same model the video step would pick.
  const effectiveTier = scene.config_overrides?.tier ?? projectTier;
  const videoModelId = scene.config_overrides?.model ?? getDefaultVideoModel(effectiveTier);
  const videoMeta = getVideoModelMeta(videoModelId);
  const audioMode = resolveAudioMode(
    {
      audio_mode: scene.audio_mode ?? 'auto',
      dialogue: scene.dialogue,
    },
    { has_native_audio: videoMeta?.has_native_audio ?? false },
  );

  if (audioMode === 'native') {
    return { ok: false, error: 'scene uses native audio — no TTS pipeline needed' };
  }

  // Resolve voice id (handles both narrator_voice shapes + character voice_id + fallback).
  const voiceId = resolveVoiceId(
    scene.dialogue.speaker,
    script.characters ?? [],
    script.narrator_voice ?? null,
  );

  // Resolve voice settings (character override → narrator override → pool default → narrator-default).
  const voiceSettings = resolveVoiceSettings(
    scene.dialogue.speaker,
    script.characters ?? [],
    script.narrator_voice ?? null,
  );

  const tts_model = getDefaultVoiceModel(effectiveTier);

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  const handle = await provider.submitVoice(
    {
      text: scene.dialogue.text,
      voice_id: voiceId,
      voice_settings: voiceSettings,
      tts_provider_model: tts_model,
    },
    ctx,
  );

  const { job_id, existing } = await recordPendingJob({
    user_id: user.id,
    project_id: input.project_id,
    scene_id: input.scene_id,
    kind: 'voice',
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    request_input: {
      ...(handle.request_input ?? {}),
      voice_id: voiceId,
      text: scene.dialogue.text,
    },
  });

  return { ok: true, job_id, existing };
}
