'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import { buildDirectorTools } from '@/server/lib/director-tools';
import { enrichChips } from '@/server/lib/enrich-chips';
import { extractToolSteps } from '@/server/lib/extract-tool-steps';
import { logLLMCall } from '@/server/lib/log-llm-call';
import {
  type Character,
  type ChatMessage,
  buildDirectorSystemPrompt,
  classifyLLMError,
  getModelParams,
} from '@mango/core';
import { calculateCost } from '@mango/core/llm/pricing';
import { getServerSupabase } from '@mango/db/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, stepCountIs } from 'ai';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const SendChatSchema = z.object({
  project_id: z.string().uuid(),
  content: z.string().min(1).max(4000),
});

export async function sendChatMessageAction(
  input: z.infer<typeof SendChatSchema>,
): Promise<{ reply: string }> {
  const { project_id, content } = SendChatSchema.parse(input);
  const userId = await getCurrentUserId();
  const supabase = await getServerSupabase();

  const { error: insertUserErr } = await supabase
    .from('chat_messages')
    .insert({ project_id, role: 'user', content });
  if (insertUserErr) throw new Error(`sendChat user-msg: ${insertUserErr.message}`);

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('idea, style, format, target_duration_sec, script')
    .eq('id', project_id)
    .single();
  if (projErr || !project) throw new Error(`sendChat project: ${projErr?.message ?? 'not found'}`);

  const { data: history, error: histErr } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('project_id', project_id)
    .order('created_at', { ascending: true });
  if (histErr) throw new Error(`sendChat history: ${histErr.message}`);

  const messages: ChatMessage[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const openrouter = createOpenRouter({ apiKey });
  const params = getModelParams('chat');

  // Извлекаем active/archived characters из script для Director context
  const scriptCharacters =
    ((project.script ?? {}) as { characters?: Character[] }).characters ?? [];
  const activeCharacters = scriptCharacters
    .filter((c) => !c.archived)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      has_dossier: c.dossier != null,
    }));
  const archivedCharacters = scriptCharacters
    .filter((c) => c.archived)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));

  const systemPrompt = buildDirectorSystemPrompt({
    idea: project.idea,
    duration_sec: project.target_duration_sec,
    format: project.format ?? '9:16',
    style: project.style ?? '3d_pixar',
    script: project.script,
    activeCharacters,
    archivedCharacters,
  });
  const tools = buildDirectorTools({ project_id });

  const start = Date.now();
  try {
    const result = await generateText({
      model: openrouter(params.model),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5),
      temperature: params.temperature,
      maxOutputTokens: params.max_tokens,
      providerOptions: {
        openrouter: { provider: { ignore: ['DeepInfra'] } },
      },
    });

    // Phase 1.2.6 — extract tool steps from AI SDK result, enrich with names + sync hints,
    // persist на assistant row через новые колонки tool_chips / pending_action.
    const extracted = extractToolSteps(result.steps);
    const sceneList =
      ((project.script ?? {}) as { scenes?: { description: string }[] }).scenes ?? [];
    const enrichedChips = enrichChips(extracted.chips, {
      characters: scriptCharacters as Character[],
      scenes: sceneList,
    });
    const finalChips = extracted.conflictError
      ? [...enrichedChips, extracted.conflictError]
      : enrichedChips;

    const reply = result.text.trim() || (extracted.pending ? 'Подтверди — я выполню.' : 'Готово.');

    const insertPayload: {
      project_id: string;
      role: 'assistant';
      content: string;
      tool_chips?: unknown;
      pending_action?: unknown;
    } = {
      project_id,
      role: 'assistant',
      content: reply,
    };
    if (finalChips.length > 0) insertPayload.tool_chips = finalChips;
    if (extracted.pending) insertPayload.pending_action = extracted.pending;

    const { error: insertAssistantErr } = await supabase
      .from('chat_messages')
      .insert(insertPayload as never);
    if (insertAssistantErr) {
      // Fail loud вместо silent drop — без этого на проде юзер видел только optimistic
      // state, а после refresh assistant сообщение исчезало (dataloss).
      throw new Error(`sendChat assistant-msg: ${insertAssistantErr.message}`);
    }

    const total = result.totalUsage;
    const promptTokens = total?.inputTokens ?? 0;
    const completionTokens = total?.outputTokens ?? 0;
    const cost_usd = await calculateCost(params.model, promptTokens, completionTokens);

    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'chat',
      status: 'success',
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_usd,
        model: params.model,
        latency_ms: Date.now() - start,
      },
    });

    revalidatePath(`/projects/${project_id}`);
    return { reply };
  } catch (err) {
    const llmErr = classifyLLMError(err);
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'chat',
      status: 'error',
      error_code: llmErr.code,
      model: params.model,
    });
    throw llmErr;
  }
}
