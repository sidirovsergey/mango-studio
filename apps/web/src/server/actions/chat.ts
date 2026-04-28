'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { classifyLLMError, getLLMProvider, getModelParams, type ChatMessage } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { getCurrentUserId } from '@/lib/auth/get-user';
import { logLLMCall } from '@/server/lib/log-llm-call';

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

  const { data: history, error: histErr } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('project_id', project_id)
    .order('created_at', { ascending: true });
  if (histErr) throw new Error(`sendChat history: ${histErr.message}`);

  const messages: ChatMessage[] = history.map((m) => ({
    role: m.role as ChatMessage['role'],
    content: m.content,
  }));

  const llm = getLLMProvider();
  try {
    const result = await llm.chat({ messages });

    await supabase
      .from('chat_messages')
      .insert({ project_id, role: 'assistant', content: result.output.reply });

    await logLLMCall({
      user_id: userId,
      project_id,
      method: 'chat',
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
      method: 'chat',
      status: 'error',
      error_code: llmErr.code,
      model: getModelParams('chat').model,
    });
    throw llmErr;
  }
}
