'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import type { Character } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().min(1),
  tts_voice_id: z.string().min(1),
});

type Input = z.infer<typeof InputSchema>;

type ScriptShape = {
  characters?: Character[];
  scenes?: Array<{
    scene_id: string;
    dialogue?: { speaker: string; text: string } | null;
    voice_audio_versions?: unknown[];
  }>;
};

export async function setCharacterVoiceAction(rawInput: unknown): Promise<
  | { ok: true; character_id: string; tts_voice_id: string }
  | {
      ok: false;
      error: 'unauthorized' | 'not_found' | 'character_not_found' | 'voice_locked';
      details?: string;
    }
> {
  let input: Input;
  try {
    input = InputSchema.parse(rawInput);
  } catch {
    return { ok: false, error: 'not_found' };
  }

  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

  const sb = await getServerSupabase();

  const { data: project, error: readErr } = await sb
    .from('projects')
    .select('script')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single();
  if (readErr || !project) return { ok: false, error: 'not_found' };

  const script = (project.script ?? { characters: [], scenes: [] }) as ScriptShape;
  const chars = script.characters ?? [];
  const idx = chars.findIndex((c) => c.id === input.character_id);
  if (idx < 0) return { ok: false, error: 'character_not_found' };

  const current = chars[idx];
  if (!current) return { ok: false, error: 'character_not_found' };

  // Critical guard: if any scene has rendered voice audio for this character, refuse.
  // dialogue.speaker can be 'narrator' or a character_id (UUID).
  const scenes = script.scenes ?? [];
  for (const scene of scenes) {
    if (
      scene.dialogue?.speaker === input.character_id &&
      (scene.voice_audio_versions?.length ?? 0) > 0
    ) {
      return {
        ok: false,
        error: 'voice_locked',
        details: `Scene "${scene.scene_id}" has rendered audio. Voice changes after audio render would create inconsistency.`,
      };
    }
  }

  // Update character.voice.tts_voice_id, preserving all other voice fields.
  const updated: Character = {
    ...current,
    voice: {
      ...current.voice,
      tts_voice_id: input.tts_voice_id,
    },
  };
  const newChars = [...chars];
  newChars[idx] = updated;

  const { error: updateErr } = await sb
    .from('projects')
    .update({
      script: { ...script, characters: newChars } as never,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.project_id)
    .eq('user_id', user.id);
  if (updateErr) return { ok: false, error: 'not_found' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true, character_id: input.character_id, tts_voice_id: input.tts_voice_id };
}
