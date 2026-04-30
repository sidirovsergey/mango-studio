'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import { logLLMCall } from '@/server/lib/log-llm-call';
import {
  type Character,
  type PersistedScript,
  applyCharacterActions,
  classifyLLMError,
  getLLMProvider,
  getModelParams,
} from '@mango/core';
import type { Database } from '@mango/db';
import { getServerSupabase } from '@mango/db/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ProjectIdSchema = z.object({ project_id: z.string().uuid() });

async function loadProjectForGeneration(projectId: string) {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, idea, style, format, target_duration_sec, script')
    .eq('id', projectId)
    .single();
  if (error || !data) throw new Error(`loadProjectForGeneration: ${error?.message ?? 'not found'}`);
  return data;
}

async function persistScript(projectId: string, script: PersistedScript) {
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from('projects')
    .update({
      script: script as unknown as Database['public']['Tables']['projects']['Update']['script'],
      status: 'script_ready',
    })
    .eq('id', projectId);
  if (error) throw new Error(`persistScript: ${error.message}`);
}

/** Extract active Character[] from a persisted script stored in the DB */
function getExistingCharacters(rawScript: unknown): Character[] {
  if (!rawScript || typeof rawScript !== 'object') return [];
  const s = rawScript as { characters?: unknown };
  if (!Array.isArray(s.characters)) return [];
  return (s.characters as Character[]).filter((c) => !c.archived);
}

export async function generateScriptAction(
  input: z.infer<typeof ProjectIdSchema>,
): Promise<PersistedScript> {
  const { project_id } = ProjectIdSchema.parse(input);
  const userId = await getCurrentUserId();
  const project = await loadProjectForGeneration(project_id);
  const llm = getLLMProvider();

  try {
    const result = await llm.generateScript({
      user_prompt: project.idea,
      format: project.format as '9:16' | '16:9' | '1:1',
      duration_sec: project.target_duration_sec,
      style: project.style as '3d_pixar' | '2d_drawn' | 'clay_art',
      // First generation — no existing characters
      existingCharacters: [],
    });
    // Apply diff-merge: all actions are 'add' on first gen
    const mergedCharacters = applyCharacterActions([], result.output.characters);
    const newScript: PersistedScript = {
      title: result.output.title,
      scenes: result.output.scenes,
      characters: mergedCharacters,
    };
    await persistScript(project_id, newScript);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'generateScript',
      status: 'success',
      usage: result.usage,
    });
    revalidatePath(`/projects/${project_id}`);
    return newScript;
  } catch (err) {
    const llmErr = classifyLLMError(err);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'generateScript',
      status: 'error',
      error_code: llmErr.code,
      model: getModelParams('script').model,
    });
    throw llmErr;
  }
}

export async function regenScriptAction(
  input: z.infer<typeof ProjectIdSchema>,
): Promise<PersistedScript> {
  const { project_id } = ProjectIdSchema.parse(input);
  const userId = await getCurrentUserId();
  const project = await loadProjectForGeneration(project_id);
  const llm = getLLMProvider();

  const existingCharacters = getExistingCharacters(project.script);
  const existingForPrompt = existingCharacters.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
  }));

  try {
    const result = await llm.generateScript({
      user_prompt: project.idea,
      format: project.format as '9:16' | '16:9' | '1:1',
      duration_sec: project.target_duration_sec,
      style: project.style as '3d_pixar' | '2d_drawn' | 'clay_art',
      existingCharacters: existingForPrompt,
    });
    const mergedCharacters = applyCharacterActions(existingCharacters, result.output.characters);
    const newScript: PersistedScript = {
      title: result.output.title,
      scenes: result.output.scenes,
      characters: mergedCharacters,
    };
    await persistScript(project_id, newScript);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'generateScript',
      status: 'success',
      usage: result.usage,
    });
    revalidatePath(`/projects/${project_id}`);
    return newScript;
  } catch (err) {
    const llmErr = classifyLLMError(err);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'generateScript',
      status: 'error',
      error_code: llmErr.code,
      model: getModelParams('script').model,
    });
    throw llmErr;
  }
}

const RefineScriptSchema = z.object({
  project_id: z.string().uuid(),
  instruction: z.string().min(1).max(500),
});

export async function refineScriptAction(
  input: z.infer<typeof RefineScriptSchema>,
): Promise<PersistedScript> {
  const { project_id, instruction } = RefineScriptSchema.parse(input);
  const userId = await getCurrentUserId();
  const project = await loadProjectForGeneration(project_id);
  const llm = getLLMProvider();

  const existingCharacters = getExistingCharacters(project.script);
  const existingForPrompt = existingCharacters.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
  }));

  // Pass existing scenes context so the LLM can preserve good findings
  // (character names, plot beats, comedic moments) rather than regenerating blank.
  const currentScenesContext = project.script
    ? (() => {
        const existing = project.script as unknown as PersistedScript;
        const sceneList = existing.scenes
          .map((s, i) => `${i + 1}. (${s.duration_sec} сек) ${s.description}`)
          .join('\n\n');
        return `\n\nТекущий сценарий (название «${existing.title}»):\n${sceneList}\n\nПерерабатывай этот сценарий согласно пожеланиям, сохраняя логику, персонажей и удачные находки где уместно. Можешь менять количество сцен и длительности.`;
      })()
    : '';
  const augmentedPrompt = `${project.idea}\n\nДополнительные пожелания: ${instruction}${currentScenesContext}`;

  try {
    const result = await llm.generateScript({
      user_prompt: augmentedPrompt,
      format: project.format as '9:16' | '16:9' | '1:1',
      duration_sec: project.target_duration_sec,
      style: project.style as '3d_pixar' | '2d_drawn' | 'clay_art',
      existingCharacters: existingForPrompt,
    });
    const mergedCharacters = applyCharacterActions(existingCharacters, result.output.characters);
    const newScript: PersistedScript = {
      title: result.output.title,
      scenes: result.output.scenes,
      characters: mergedCharacters,
    };
    await persistScript(project_id, newScript);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'generateScript',
      status: 'success',
      usage: result.usage,
    });
    revalidatePath(`/projects/${project_id}`);
    return newScript;
  } catch (err) {
    const llmErr = classifyLLMError(err);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'generateScript',
      status: 'error',
      error_code: llmErr.code,
      model: getModelParams('script').model,
    });
    throw llmErr;
  }
}

const AddSceneSchema = z.object({
  project_id: z.string().uuid(),
  instruction: z.string().min(1).max(500),
});

export async function addSceneAction(
  input: z.infer<typeof AddSceneSchema>,
): Promise<PersistedScript> {
  const { project_id, instruction } = AddSceneSchema.parse(input);
  const userId = await getCurrentUserId();
  const project = await loadProjectForGeneration(project_id);
  if (!project.script) throw new Error('addScene: project has no script yet');
  const script = project.script as unknown as PersistedScript;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const openrouter = createOpenRouter({ apiKey });
  const params = getModelParams('refine');
  const start = Date.now();

  const styleLabel: Record<string, string> = {
    '3d_pixar': '3D Pixar',
    '2d_drawn': '2D рисованный',
    clay_art: 'Клей-арт',
  };
  const styleHuman = styleLabel[project.style ?? '3d_pixar'] ?? project.style;

  const systemPrompt = `Ты — Mango, AI-режиссёр короткого мультика. Тебе нужно ДОБАВИТЬ ОДНУ новую сцену к уже существующему сценарию по запросу пользователя.

Верни ТОЛЬКО валидный JSON без markdown-блоков и пояснений:
{
  "description": "подробное одно-два предложения описания сцены для генерации видео в том же стиле и тоне, что и существующие сцены",
  "duration_sec": 7,
  "voiceover": "опционально — закадровый текст, пропусти если не нужен"
}

description должен быть ЗАКОНЧЕННОЙ сценой, не продолжением последней. duration_sec — целое число от 4 до 12 секунд.`;

  const userPrompt = `Идея проекта: «${project.idea}». Стиль: ${styleHuman}.

Существующие сцены (${script.scenes.length}):
${script.scenes.map((s, i) => `${i + 1}. (${s.duration_sec} сек) ${s.description}`).join('\n\n')}

Инструкция пользователя: добавь сцену — «${instruction}»

Верни JSON одной новой сцены, которая логично встанет В КОНЕЦ.`;

  try {
    const { text, usage } = await generateText({
      model: openrouter(params.model),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: params.temperature,
      maxOutputTokens: 800,
      providerOptions: {
        openrouter: {
          response_format: { type: 'json_object' },
          provider: { ignore: ['DeepInfra'] },
        },
      },
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new SyntaxError('addScene: no JSON in LLM response');
    const parsed = JSON.parse(jsonMatch[0]) as {
      description?: string;
      duration_sec?: number;
      voiceover?: string;
    };
    if (!parsed.description || typeof parsed.description !== 'string') {
      throw new Error('addScene: missing or invalid description in LLM response');
    }

    const maxId = script.scenes.reduce((max, s) => {
      const num = Number.parseInt(s.scene_id.replace(/^s/, ''), 10);
      return Number.isFinite(num) && num > max ? num : max;
    }, 0);
    const newScene = {
      scene_id: `s${maxId + 1}`,
      description: parsed.description.trim(),
      duration_sec:
        typeof parsed.duration_sec === 'number' &&
        parsed.duration_sec >= 4 &&
        parsed.duration_sec <= 12
          ? Math.round(parsed.duration_sec)
          : 7,
      ...(typeof parsed.voiceover === 'string' && parsed.voiceover.trim()
        ? { voiceover: parsed.voiceover.trim() }
        : {}),
    };

    const updated: PersistedScript = {
      ...script,
      scenes: [...script.scenes, newScene],
    };
    await persistScript(project_id, updated);

    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'refineScene',
      status: 'success',
      usage: {
        prompt_tokens: usage?.inputTokens ?? 0,
        completion_tokens: usage?.outputTokens ?? 0,
        cost_usd: 0,
        model: params.model,
        latency_ms: Date.now() - start,
      },
    });

    revalidatePath(`/projects/${project_id}`);
    return updated;
  } catch (err) {
    const llmErr = classifyLLMError(err);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'refineScene',
      status: 'error',
      error_code: llmErr.code,
      model: params.model,
    });
    throw llmErr;
  }
}

const DeleteSceneSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
});

export async function deleteSceneAction(
  input: z.infer<typeof DeleteSceneSchema>,
): Promise<PersistedScript> {
  const { project_id, scene_id } = DeleteSceneSchema.parse(input);
  await getCurrentUserId();
  const project = await loadProjectForGeneration(project_id);
  if (!project.script) throw new Error('deleteScene: project has no script yet');
  const script = project.script as unknown as PersistedScript;
  const remaining = script.scenes.filter((s) => s.scene_id !== scene_id);
  if (remaining.length === script.scenes.length) {
    throw new Error(`deleteScene: scene_id ${scene_id} not found`);
  }
  if (remaining.length < 2) {
    throw new Error('deleteScene: cannot leave script with fewer than 2 scenes');
  }
  const updated: PersistedScript = { ...script, scenes: remaining };
  await persistScript(project_id, updated);
  revalidatePath(`/projects/${project_id}`);
  return updated;
}

const RefineBeatSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  instruction: z.string().min(1).max(500),
});

export async function refineBeatAction(
  input: z.infer<typeof RefineBeatSchema>,
): Promise<{ updated_description: string }> {
  const { project_id, scene_id, instruction } = RefineBeatSchema.parse(input);
  const userId = await getCurrentUserId();
  const project = await loadProjectForGeneration(project_id);

  if (!project.script) throw new Error('refineBeat: project has no script yet');
  const script = project.script as unknown as PersistedScript;
  const targetScene = script.scenes.find((s) => s.scene_id === scene_id);
  if (!targetScene) throw new Error(`refineBeat: scene_id ${scene_id} not found`);

  const llm = getLLMProvider();
  try {
    const result = await llm.refineScene({
      scene_id,
      current: targetScene.description,
      instruction,
    });

    const updatedScript: PersistedScript = {
      ...script,
      scenes: script.scenes.map((s) =>
        s.scene_id === scene_id ? { ...s, description: result.output.updated_description } : s,
      ),
    };
    await persistScript(project_id, updatedScript);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'refineScene',
      status: 'success',
      usage: result.usage,
    });
    revalidatePath(`/projects/${project_id}`);
    return result.output;
  } catch (err) {
    const llmErr = classifyLLMError(err);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'refineScene',
      status: 'error',
      error_code: llmErr.code,
      model: getModelParams('refine').model,
    });
    throw llmErr;
  }
}
