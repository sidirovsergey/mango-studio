'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import {
  AppearanceSchema,
  type Character,
  CharacterSchema,
  buildDossierPrompt,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).default('Новый персонаж'),
  description: z.string().default(''),
  // NEW — путь из чата: structured LLM-pass раскладывает instruction в поля
  instruction: z.string().optional(),
});

const StructuredAddOutputSchema = z.object({
  description: z.string(),
  appearance: AppearanceSchema,
  personality: z.string().optional(),
});

export async function createCharacterAction(rawInput: unknown): Promise<
  | {
      ok: true;
      character_id: string;
      partial?: boolean;
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
    .select('script, style')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single();
  if (readErr || !project) return { ok: false, error: 'project not found' };

  const style = (project.style ?? '3d_pixar') as '3d_pixar' | '2d_drawn' | 'clay_art';
  const script = (project.script ?? { characters: [] }) as { characters?: Character[] };

  // Структурируем поля если задан instruction (путь из чата). Иначе — старое поведение.
  let structured: { description: string; appearance: Character['appearance']; personality?: string } | null = null;
  let partial = false;

  if (input.instruction) {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
      const openrouter = createOpenRouter({ apiKey });
      const modelId =
        process.env.LLM_MODEL_REFINE ?? process.env.LLM_MODEL_DEFAULT ?? 'x-ai/grok-4.1-fast';

      const { object } = await generateObject({
        model: openrouter(modelId),
        schema: StructuredAddOutputSchema,
        system:
          'Ты структурируешь описание нового персонажа мультика для пайплайна генерации. Возвращай поля description (1-2 предложения), appearance (структурно: age, build, species, distinctive[]), personality (если упомянут).',
        prompt: `Имя персонажа: "${input.name}"

Описание от пользователя: ${input.instruction}

Структурируй в JSON.`,
        providerOptions: {
          openrouter: { provider: { ignore: ['DeepInfra'] } },
        },
      });

      structured = {
        description: object.description,
        appearance: object.appearance,
        personality: object.personality,
      };
    } catch (err) {
      console.error('[createCharacterAction] structured-add LLM-pass failed (fallback to plain create)', err);
      partial = true;
      // Stash raw instruction so user has something to edit instead of empty card
      structured = {
        description: input.instruction,
        appearance: AppearanceSchema.parse({}),
        personality: undefined,
      };
    }
  }

  const description = structured?.description ?? input.description;
  const appearance = structured?.appearance ?? AppearanceSchema.parse({});
  const personality = structured?.personality;

  const newChar: Character = CharacterSchema.parse({
    id: crypto.randomUUID(),
    name: input.name,
    description,
    appearance,
    personality,
  });

  // Recompile full_prompt из заполненных полей (если есть структура — больше деталей)
  newChar.full_prompt = buildDossierPrompt(
    {
      name: newChar.name,
      description: newChar.description,
      appearance: newChar.appearance,
      personality: newChar.personality,
    },
    style,
  );

  const characters = [...(script.characters ?? []), newChar];
  const newScript = { ...script, characters };

  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: newScript as never, updated_at: new Date().toISOString() })
    .eq('id', input.project_id)
    .eq('user_id', user.id);
  if (updateErr) return { ok: false, error: 'update failed' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true, character_id: newChar.id, ...(partial ? { partial: true } : {}) };
}
