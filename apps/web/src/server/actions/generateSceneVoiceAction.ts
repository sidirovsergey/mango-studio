'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type PersistedScript,
  type Tier,
  buildVoicePrompt,
  getDefaultVoiceModel,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const FALLBACK_NARRATOR_VOICE =
  process.env.MANGO_DEFAULT_NARRATOR_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
});

type Input = z.infer<typeof InputSchema>;

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

  const script = project.script as unknown as PersistedScript;
  if (!script) return { ok: false, error: 'project has no script' };

  const tier = (project.tier ?? 'economy') as Tier;

  const scene = script.scenes.find((s) => s.scene_id === input.scene_id);
  if (!scene) return { ok: false, error: 'scene not found' };

  if (scene.dialogue === null) {
    return { ok: false, error: 'scene has no dialogue' };
  }

  // Resolve character if speaker is not narrator
  const character =
    scene.dialogue.speaker !== 'narrator'
      ? (script.characters.find((c) => c.id === scene.dialogue!.speaker) ?? null)
      : null;

  const narrator_voice = script.narrator_voice ?? { tts_voice_id: FALLBACK_NARRATOR_VOICE };

  const { voice_id, text } = buildVoicePrompt({
    dialogue: scene.dialogue,
    narrator_voice,
    character,
  });

  const tts_model = getDefaultVoiceModel(tier);

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  const handle = await provider.submitVoice(
    {
      text,
      voice_id,
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
    request_input: handle.request_input,
  });

  return { ok: true, job_id, existing };
}
