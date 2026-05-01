'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import type { Character } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
});

export async function unarchiveCharacterAction(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();

  const { data: project, error: readErr } = await sb
    .from('projects')
    .select('script')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single();
  if (readErr || !project) return { ok: false, error: 'project not found' };

  const script = (project.script ?? { characters: [] }) as { characters?: Character[] };
  const characters = script.characters ?? [];
  const idx = characters.findIndex((c) => c.id === input.character_id);
  if (idx < 0) return { ok: false, error: 'character not found' };

  const target = characters[idx] as Character;

  // Idempotent: если уже active — success, no UPDATE
  if (!target.archived) {
    revalidatePath(`/projects/${input.project_id}`);
    return { ok: true };
  }

  const updated: Character = { ...target, archived: false };
  const newCharacters = [...characters];
  newCharacters[idx] = updated;

  const { error: updateErr } = await sb
    .from('projects')
    .update({
      script: { ...script, characters: newCharacters } as never,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.project_id)
    .eq('user_id', user.id);
  if (updateErr) return { ok: false, error: 'update failed' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true };
}
