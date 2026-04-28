'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import { logLLMCall } from '@/server/lib/log-llm-call';
import {
  type ScriptGenOutput,
  classifyLLMError,
  getLLMProvider,
  getModelParams,
} from '@mango/core';
import type { Database } from '@mango/db';
import { getServerSupabase } from '@mango/db/server';
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

async function persistScript(projectId: string, script: ScriptGenOutput) {
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

export async function generateScriptAction(
  input: z.infer<typeof ProjectIdSchema>,
): Promise<ScriptGenOutput> {
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
    });
    await persistScript(project_id, result.output);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'generateScript',
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
): Promise<ScriptGenOutput> {
  return generateScriptAction(input);
}

const RefineScriptSchema = z.object({
  project_id: z.string().uuid(),
  instruction: z.string().min(1).max(500),
});

export async function refineScriptAction(
  input: z.infer<typeof RefineScriptSchema>,
): Promise<ScriptGenOutput> {
  const { project_id, instruction } = RefineScriptSchema.parse(input);
  const userId = await getCurrentUserId();
  const project = await loadProjectForGeneration(project_id);
  const llm = getLLMProvider();

  const augmentedPrompt = `${project.idea}\n\nДополнительные пожелания: ${instruction}`;

  try {
    const result = await llm.generateScript({
      user_prompt: augmentedPrompt,
      format: project.format as '9:16' | '16:9' | '1:1',
      duration_sec: project.target_duration_sec,
      style: project.style as '3d_pixar' | '2d_drawn' | 'clay_art',
    });
    await persistScript(project_id, result.output);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'generateScript',
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
      method: 'generateScript',
      status: 'error',
      error_code: llmErr.code,
      model: getModelParams('script').model,
    });
    throw llmErr;
  }
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
  const script = project.script as unknown as ScriptGenOutput;
  const targetScene = script.scenes.find((s) => s.scene_id === scene_id);
  if (!targetScene) throw new Error(`refineBeat: scene_id ${scene_id} not found`);

  const llm = getLLMProvider();
  try {
    const result = await llm.refineScene({
      scene_id,
      current: targetScene.description,
      instruction,
    });

    const updatedScript: ScriptGenOutput = {
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
