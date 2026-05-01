'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import { buildDirectorTools } from '@/server/lib/director-tools';
import { logLLMCall } from '@/server/lib/log-llm-call';
import {
  type Character,
  type ChatMessage,
  buildDirectorSystemPrompt,
  classifyLLMError,
  getModelParams,
} from '@mango/core';
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

    const reply = result.text.trim() || 'Готово.';

    await supabase.from('chat_messages').insert({ project_id, role: 'assistant', content: reply });

    const total = result.totalUsage;
    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'chat',
      status: 'success',
      usage: {
        prompt_tokens: total?.inputTokens ?? 0,
        completion_tokens: total?.outputTokens ?? 0,
        cost_usd: 0,
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
