'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getModelParams } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  instruction: z.string().max(500).optional(),
});

const DialogueSchema = z.object({
  speaker: z.union([z.literal('narrator'), z.string()]),
  text: z.string().min(1).max(500),
});

export async function regenSceneTextAction(rawInput: unknown): Promise<
  | { ok: true; dialogue: { speaker: string; text: string } }
  | { ok: false; error: string }
> {
  let input: z.infer<typeof InputSchema>;
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
    .select('id, user_id, script')
    .eq('id', input.project_id)
    .single();
  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const script = project.script as unknown as import('@mango/core').PersistedScript | null;
  if (!script) return { ok: false, error: 'project has no script' };

  const idx = script.scenes.findIndex((s) => s.scene_id === input.scene_id);
  if (idx === -1) return { ok: false, error: 'scene not found' };
  const scene = script.scenes[idx]!;

  const charLabels = scene.character_ids
    .map((id) => script.characters.find((c) => 'id' in c && c.id === id))
    .filter(<T>(c: T | undefined): c is T & { id: string; name: string } =>
      Boolean(c && typeof c === 'object' && 'name' in (c as object)),
    )
    .map((c) => `${c.name} (${c.id})`)
    .join(', ');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENROUTER_API_KEY is not set' };
  const params = getModelParams('refine');
  const openrouter = createOpenRouter({ apiKey });

  const systemPrompt = `Ты — AI-режиссёр. Перепиши реплику (dialogue) для одной сцены мультика. Верни ТОЛЬКО валидный JSON БЕЗ markdown:
{"speaker": "narrator" | "<character_id>", "text": "<новая реплика>"}

Правила:
- speaker = 'narrator' если общая закадровая реплика, либо id персонажа из числа действующих лиц.
- text — от 1 до ~30 слов, в стиле и тоне сценария.
- Никаких пояснений вне JSON.`;

  const userPrompt = `Сцена "${input.scene_id}": ${scene.description}
Длительность: ${scene.duration_sec} сек.
${charLabels ? `Действующие лица: ${charLabels}` : 'Только окружение, без персонажей в кадре.'}
Текущая реплика: ${scene.dialogue ? `${scene.dialogue.speaker}: "${scene.dialogue.text}"` : '(нет)'}
${input.instruction ? `Инструкция от пользователя: ${input.instruction}` : 'Перепиши реплику в свободной форме.'}

Верни новый JSON с одной репликой.`;

  const { text } = await generateText({
    model: openrouter(params.model),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: params.temperature,
    maxOutputTokens: 200,
    providerOptions: {
      openrouter: { response_format: { type: 'json_object' }, provider: { ignore: ['DeepInfra'] } },
    },
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ok: false, error: 'no JSON in LLM response' };
  let parsed: { speaker: string; text: string };
  try {
    parsed = DialogueSchema.parse(JSON.parse(jsonMatch[0]));
  } catch {
    return { ok: false, error: 'LLM returned invalid dialogue shape' };
  }

  const scenes = [...script.scenes];
  scenes[idx] = { ...scene, dialogue: parsed };
  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: { ...script, scenes } as never })
    .eq('id', input.project_id);
  if (updateErr) return { ok: false, error: 'update failed' };

  return { ok: true, dialogue: parsed };
}
