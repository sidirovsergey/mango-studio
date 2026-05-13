'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { submitFinalClipJob } from '@/server/lib/audio-chain-helpers';
import {
  type SceneAssetVersion,
  type StoredAsset,
  type Tier,
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
});

type Input = z.infer<typeof InputSchema>;

type SceneShape = Record<string, unknown> & {
  scene_id: string;
  audio_mode?: 'native' | 'silent_tts' | 'auto';
  config_overrides?: { tier?: Tier; model?: string };
  dialogue: { speaker: string; text: string } | null;
  video_versions?: SceneAssetVersion[];
  video_active_version_id?: string | null;
  voice_audio_versions?: SceneAssetVersion[];
  voice_audio_active_version_id?: string | null;
  final_clip?: {
    storage: StoredAsset;
    composed_from: { video_version_id: string; voice_audio_version_id: string | null };
  } | null;
};

type ScriptShape = { scenes: SceneShape[] };

export async function composeSceneFinalClipAction(
  rawInput: unknown,
): Promise<
  | { ok: true; job_id: string; existing: boolean }
  | { ok: true; mode: 'native_passthrough' }
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

  const activeVideo = getActiveVersion({
    versions: scene.video_versions ?? [],
    active_version_id: scene.video_active_version_id ?? null,
  });
  if (!activeVideo) return { ok: false, error: 'scene has no video yet' };

  const effectiveTier = scene.config_overrides?.tier ?? projectTier;
  const videoModelId =
    activeVideo.model ?? scene.config_overrides?.model ?? getDefaultVideoModel(effectiveTier);
  const meta = getVideoModelMeta(videoModelId);
  const audioMode = resolveAudioMode(
    { audio_mode: scene.audio_mode ?? 'auto', dialogue: scene.dialogue },
    { has_native_audio: meta?.has_native_audio ?? false },
  );

  // silent_tts: need active voice version.
  let activeVoice: SceneAssetVersion | null = null;
  if (audioMode !== 'native') {
    activeVoice = getActiveVersion({
      versions: scene.voice_audio_versions ?? [],
      active_version_id: scene.voice_audio_active_version_id ?? null,
    });
    if (!activeVoice) return { ok: false, error: 'scene has no voice_audio yet' };
  }

  const r = await submitFinalClipJob({
    user_id: user.id,
    project_id: input.project_id,
    scene_id: input.scene_id,
    video_version: {
      version_id: activeVideo.version_id,
      storage: activeVideo.storage,
      has_native_audio: meta?.has_native_audio ?? false,
    },
    voice_version:
      audioMode === 'native' || !activeVoice
        ? null
        : { version_id: activeVoice.version_id, storage: activeVoice.storage },
    initial_retry_count: 0,
    current_script: script,
  });

  if (!r.ok) return r;
  return r.mode === 'native_passthrough'
    ? { ok: true, mode: 'native_passthrough' }
    : { ok: true, job_id: r.job_id, existing: r.existing };
}
