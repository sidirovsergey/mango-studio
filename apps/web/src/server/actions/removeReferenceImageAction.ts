'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import type { Character } from '@mango/core';
import { getServerSupabase, getServiceRoleSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  ref_index: z.number().int().nonnegative(),
});

export async function removeReferenceImageAction(
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
  const idx = script.characters?.findIndex((c) => c.id === input.character_id) ?? -1;
  if (idx < 0) return { ok: false, error: 'character not found' };
  const chars = script.characters!;
  const current = chars[idx];
  if (!current) return { ok: false, error: 'character not found' };

  const ref = current.reference_images[input.ref_index];
  if (!ref) return { ok: false, error: 'ref index out of bounds' };

  // Storage cleanup — try/catch, не блокируем основной flow
  if (ref.storage.kind === 'supabase') {
    try {
      const { error } = await admin.storage.from('character-references').remove([ref.storage.path]);
      if (error) console.error('[removeReferenceImageAction] storage remove failed', error);
    } catch (e) {
      console.error('[removeReferenceImageAction] storage remove threw', e);
    }
  }

  const newRefs = current.reference_images.filter((_, i) => i !== input.ref_index);
  const updated: Character = { ...current, reference_images: newRefs };
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
