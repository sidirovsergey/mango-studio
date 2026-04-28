import 'server-only';
import type { LLMUsage } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';

type LLMMethod = 'generateScript' | 'refineScene' | 'chat';

interface LogLLMCallBase {
  user_id: string;
  project_id: string | null;
  method: LLMMethod;
  usage?: LLMUsage;
  model?: string;
}

export type LogLLMCallParams =
  | (LogLLMCallBase & { status: 'success'; error_code?: never })
  | (LogLLMCallBase & { status: 'error'; error_code: string });

export async function logLLMCall(params: LogLLMCallParams): Promise<void> {
  const supabase = await getServerSupabase();
  try {
    await supabase.from('llm_calls').insert({
      user_id: params.user_id,
      project_id: params.project_id,
      method: params.method,
      model: params.usage?.model ?? params.model ?? 'unknown',
      prompt_tokens: params.usage?.prompt_tokens ?? 0,
      completion_tokens: params.usage?.completion_tokens ?? 0,
      cost_usd: params.usage?.cost_usd ?? 0,
      latency_ms: params.usage?.latency_ms ?? 0,
      status: params.status,
      error_code: params.error_code ?? null,
    });
  } catch (err) {
    console.error('[logLLMCall] failed to insert:', err);
  }
}
