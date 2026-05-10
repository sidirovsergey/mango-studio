'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { type Character, getVoiceById } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  voice_id: z.string().min(1),
  voice_label: z.string().min(1),
  advanced: z.boolean().optional(),
});

type Input = z.infer<typeof InputSchema>;

export async function setCharacterVoiceAction(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let input: Input;
  try {
    input = InputSchema.parse(rawInput);
  } catch {
    return { ok: false, error: 'invalid input' };
  }

  // Pool gate (skipped when advanced=true).
  if (!input.advanced && !getVoiceById(input.voice_id)) {
    return {
      ok: false,
      error: `voice_id ${input.voice_id} не входит в pool — передай advanced=true для custom`,
    };
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
  if (readErr || !project) return { ok: false, error: 'project not found' };

  const script = (project.script ?? { characters: [] }) as { characters?: Character[] };
  const chars = script.characters ?? [];
  const idx = chars.findIndex((c) => c.id === input.character_id);
  if (idx < 0) return { ok: false, error: 'character not found' };

  const current = chars[idx];
  if (!current) return { ok: false, error: 'character not found' };
  const updated: Character = {
    ...current,
    voice_id: input.voice_id,
    voice_label: input.voice_label,
  };
  const characters = [...chars];
  characters[idx] = updated;

  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: { ...script, characters } as never })
    .eq('id', input.project_id)
    .eq('user_id', user.id);
  if (updateErr) return { ok: false, error: 'update failed' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true };
}
