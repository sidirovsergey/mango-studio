'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import type { Character } from '@mango/core';
import { getServerSupabase, getServiceRoleSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
});

export async function deleteCharacterAction(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();
  const admin = getServiceRoleSupabase();

  const { data: project, error: readErr } = await sb
    .from('projects')
    .select('script')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single();
  if (readErr || !project) return { ok: false, error: 'project not found' };

  const script = (project.script ?? { characters: [] }) as { characters?: Character[] };
  const characters = script.characters ?? [];
  const character = characters.find((c) => c.id === input.character_id);
  if (!character) return { ok: false, error: 'character not found' };

  const refPaths: string[] = [];
  for (const r of character.reference_images ?? []) {
    if (r.storage.kind === 'supabase') refPaths.push(r.storage.path);
  }
  if (refPaths.length > 0) {
    try {
      const { error: rmErr } = await admin.storage.from('character-references').remove(refPaths);
      if (rmErr) console.error('[deleteCharacterAction] refs remove failed', rmErr);
    } catch (e) {
      console.error('[deleteCharacterAction] refs remove threw', e);
    }
  }

  if (character.dossier?.storage.kind === 'supabase') {
    try {
      const { error: rmErr } = await admin.storage
        .from('character-dossiers')
        .remove([character.dossier.storage.path]);
      if (rmErr) console.error('[deleteCharacterAction] dossier remove failed', rmErr);
    } catch (e) {
      console.error('[deleteCharacterAction] dossier remove threw', e);
    }
  }

  const newCharacters = characters.filter((c) => c.id !== input.character_id);
  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: { ...script, characters: newCharacters } as never })
    .eq('id', input.project_id)
    .eq('user_id', user.id);
  if (updateErr) return { ok: false, error: 'update failed' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true };
}
