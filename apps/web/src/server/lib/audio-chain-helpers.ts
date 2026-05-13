import 'server-only';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type Character,
  type StoredAsset,
  type Tier,
  getDefaultVideoModel,
  getDefaultVoiceModel,
  getVideoModelMeta,
  resolveVoiceId,
  resolveVoiceSettings,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';

type Dialogue = { speaker: string; text: string };

type NarratorVoice = {
  tts_voice_id: string;
  description?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
} | null;

export type SubmitVoiceJobInput = {
  user_id: string;
  project_id: string;
  scene_id: string;
  dialogue: Dialogue;
  characters: Character[];
  narrator_voice: NarratorVoice;
  effective_tier: Tier;
  /** Model id from the active video version (or scene override) used to resolve audio mode. */
  video_model_id?: string;
  /** Override the resolved voice_id (Director override / retry with custom). */
  voice_id_override?: string;
  /** Override the dialogue text (Director "озвучь сцену с другим текстом"). */
  text_override?: string;
  /** 0 for first try, 1 for first auto-retry. */
  initial_retry_count: number;
  /** ISO string — poll-loop skips rows where delayed_until > now(). */
  delayed_until?: string;
};

export type SubmitVoiceJobResult =
  | { ok: true; job_id: string; existing: boolean }
  | { ok: false; error: string };

export async function submitVoiceJob(input: SubmitVoiceJobInput): Promise<SubmitVoiceJobResult> {
  const text = (input.text_override ?? input.dialogue.text).trim();
  if (!text) return { ok: false, error: 'scene has no dialogue' };

  const videoModelId = input.video_model_id ?? getDefaultVideoModel(input.effective_tier);
  const videoMeta = getVideoModelMeta(videoModelId);
  // Side-effect-free use of the model meta — surfaces F32 contract via getVideoModelMeta.
  void videoMeta;

  const voiceId =
    input.voice_id_override ??
    resolveVoiceId(input.dialogue.speaker, input.characters, input.narrator_voice);

  const voiceSettings = resolveVoiceSettings(
    input.dialogue.speaker,
    input.characters,
    input.narrator_voice,
  );

  const tts_model = getDefaultVoiceModel(input.effective_tier);

  const provider = getMediaProvider();
  const ctx = {
    user_id: input.user_id,
    project_id: input.project_id,
    character_id: '',
  };

  const handle = await provider.submitVoice(
    {
      text,
      voice_id: voiceId,
      voice_settings: voiceSettings,
      tts_provider_model: tts_model,
    },
    ctx,
  );

  const { job_id, existing } = await recordPendingJob({
    user_id: input.user_id,
    project_id: input.project_id,
    scene_id: input.scene_id,
    kind: 'voice',
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    retry_count: input.initial_retry_count,
    delayed_until: input.delayed_until ?? null,
    request_input: {
      ...(handle.request_input ?? {}),
      voice_id: voiceId,
      text,
    },
  });

  return { ok: true, job_id, existing };
}

export type SubmitFinalClipJobInput = {
  user_id: string;
  project_id: string;
  scene_id: string;
  video_version: {
    version_id: string;
    storage: StoredAsset;
    has_native_audio?: boolean;
  };
  /** null → native passthrough (write final_clip = video directly, no fal job). */
  voice_version: {
    version_id: string;
    storage: StoredAsset;
  } | null;
  initial_retry_count: number;
  delayed_until?: string;
  /**
   * Required only when `voice_version === null` (native passthrough path):
   * the helper writes the script update in-place. Callers that have already
   * loaded the script should pass it here to avoid a redundant select.
   */
  current_script?: { scenes: Array<Record<string, unknown> & { scene_id: string }> };
};

export type SubmitFinalClipJobResult =
  | { ok: true; mode: 'mux_job'; job_id: string; existing: boolean }
  | { ok: true; mode: 'native_passthrough' }
  | { ok: false; error: string };

function urlOfStorage(storage: StoredAsset): string {
  if (storage.kind === 'fal_passthrough') return storage.url;
  return `supabase://${storage.path}`;
}

export async function submitFinalClipJob(
  input: SubmitFinalClipJobInput,
): Promise<SubmitFinalClipJobResult> {
  // Native passthrough — final_clip is the active video. Write directly to script.
  if (!input.voice_version) {
    const sb = await getServerSupabase();
    let script = input.current_script;
    if (!script) {
      const { data: project, error } = await sb
        .from('projects')
        .select('script')
        .eq('id', input.project_id)
        .single();
      if (error || !project) return { ok: false, error: 'project not found' };
      script = project.script as { scenes: Array<Record<string, unknown> & { scene_id: string }> };
    }
    const updated = {
      ...script,
      scenes: script.scenes.map((s) =>
        s.scene_id === input.scene_id
          ? {
              ...s,
              final_clip: {
                storage: input.video_version.storage,
                composed_from: {
                  video_version_id: input.video_version.version_id,
                  voice_audio_version_id: null,
                },
              },
            }
          : s,
      ),
    };
    const { error: upErr } = await sb
      .from('projects')
      .update({ script: updated as never })
      .eq('id', input.project_id);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, mode: 'native_passthrough' };
  }

  // Mux job via fal.
  const provider = getMediaProvider();
  const ctx = {
    user_id: input.user_id,
    project_id: input.project_id,
    character_id: '',
  };

  const handle = await provider.submitFinalClipMux(
    {
      video_url: urlOfStorage(input.video_version.storage),
      audio_url: urlOfStorage(input.voice_version.storage),
    },
    ctx,
  );

  const { job_id, existing } = await recordPendingJob({
    user_id: input.user_id,
    project_id: input.project_id,
    scene_id: input.scene_id,
    kind: 'final_clip',
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    retry_count: input.initial_retry_count,
    delayed_until: input.delayed_until ?? null,
    request_input: {
      ...(handle.request_input ?? {}),
      video_version_id: input.video_version.version_id,
      voice_audio_version_id: input.voice_version.version_id,
    },
  });

  return { ok: true, mode: 'mux_job', job_id, existing };
}
