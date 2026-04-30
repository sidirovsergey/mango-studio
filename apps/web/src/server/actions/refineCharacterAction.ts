'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { AppearanceSchema, type Character, buildDossierPrompt } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  instruction: z.string().min(1),
});

const RefineOutputSchema = z.object({
  description: z.string(),
  appearance: AppearanceSchema,
  personality: z.string().optional(),
});

export async function refineCharacterAction(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = InputSchema.parse(rawInput);
  const user = await getCurrentUser();
  const sb = await getServerSupabase();

  const { data: project, error: readErr } = await sb
    .from('projects')
    .select('script, style')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single();
  if (readErr || !project) return { ok: false, error: 'project not found' };

  const script = (project.script ?? { characters: [] }) as { characters?: Character[] };
  const characters = script.characters ?? [];
  const idx = characters.findIndex((c) => c.id === input.character_id);
  if (idx < 0) return { ok: false, error: 'character not found' };
  const current = characters[idx] as Character;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const openrouter = createOpenRouter({ apiKey });
  const modelId =
    process.env.LLM_MODEL_REFINE ?? process.env.LLM_MODEL_DEFAULT ?? 'x-ai/grok-4.1-fast';

  const { object } = await generateObject({
    model: openrouter(modelId),
    schema: RefineOutputSchema,
    system:
      'Ты обновляешь карточку персонажа. Возвращай обновлённые description (1-2 предложения), appearance (структурно), personality (если изменилась).',
    prompt: `Текущий персонаж "${current.name}":
Description: ${current.description}
Appearance: ${JSON.stringify(current.appearance)}
Personality: ${current.personality ?? '—'}

Инструкция от пользователя: ${input.instruction}

Верни обновлённые поля.`,
  });

  const style = (project.style ?? '3d_pixar') as '3d_pixar' | '2d_drawn' | 'clay_art';
  const newFullPrompt = buildDossierPrompt(
    {
      name: current.name,
      description: object.description,
      appearance: object.appearance,
      personality: object.personality,
    },
    style,
  );

  const updated: Character = {
    ...current,
    description: object.description,
    appearance: object.appearance,
    personality: object.personality,
    full_prompt: newFullPrompt,
  };
  const newCharacters = [...characters];
  newCharacters[idx] = updated;

  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: { ...script, characters: newCharacters } as never })
    .eq('id', input.project_id)
    .eq('user_id', user.id);
  if (updateErr) return { ok: false, error: 'update failed' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true };
}
