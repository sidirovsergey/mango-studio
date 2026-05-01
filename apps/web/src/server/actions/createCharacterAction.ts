'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { type Character, CharacterSchema } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).default('Новый персонаж'),
  description: z.string().default(''),
});

export async function createCharacterAction(rawInput: unknown): Promise<
  | {
      ok: true;
      character_id: string;
    }
  | {
      ok: false;
      error: string;
    }
> {
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
  const newChar: Character = CharacterSchema.parse({
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
  });
  const characters = [...(script.characters ?? []), newChar];
  const newScript = { ...script, characters };

  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: newScript as never, updated_at: new Date().toISOString() })
    .eq('id', input.project_id)
    .eq('user_id', user.id);
  if (updateErr) return { ok: false, error: 'update failed' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true, character_id: newChar.id };
}
