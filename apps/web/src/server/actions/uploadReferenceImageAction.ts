'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import type { Character, ReferenceImage } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  supabase_path: z.string().min(1),
});

export async function uploadReferenceImageAction(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();

  const expectedPrefix = `${user.id}/${input.project_id}/${input.character_id}/`;
  if (!input.supabase_path.startsWith(expectedPrefix)) {
    return { ok: false, error: 'invalid path: must be under user/project/character folder' };
  }

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

  const newRef: ReferenceImage = {
    storage: { kind: 'supabase', path: input.supabase_path },
    source: 'user_upload',
    uploaded_at: new Date().toISOString(),
  };
  const updated: Character = {
    ...current,
    reference_images: [...(current.reference_images ?? []), newRef],
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
