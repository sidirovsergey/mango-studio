import 'server-only';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { getModelParams } from './config';
import { LLMProviderError, classifyLLMError } from './errors';
import { calculateCost } from './pricing';
import {
  REFINE_SYSTEM_PROMPT,
  buildRefineUserPrompt,
  buildScriptPrompt,
  chatMessagesWithSystem,
} from './prompts';
import type {
  ChatInput,
  ChatResult,
  LLMProvider,
  LLMUsage,
  RefineSceneInput,
  RefineSceneResult,
  ScriptGenInput,
  ScriptGenResult,
} from './provider';
import { ScriptGenSchema } from './schemas';

type ErrLike = {
  name?: string;
  message?: string;
  statusCode?: number;
  status?: number;
  url?: string;
  responseBody?: unknown;
  cause?: unknown;
  errors?: unknown;
};

function summarizeErr(e: ErrLike | undefined | null) {
  if (!e || typeof e !== 'object') return e;
  const body = typeof e.responseBody === 'string' ? e.responseBody.slice(0, 500) : e.responseBody;
  return {
    name: e.name,
    message: typeof e.message === 'string' ? e.message.slice(0, 300) : e.message,
    statusCode: e.statusCode ?? e.status,
    url: e.url,
    responseBody: body,
  };
}

function summarizeZodIssues(
  err: unknown,
): Array<{ path: string; message: string; code?: string }> | undefined {
  // Capture Zod validation issues — much more useful than message-only summary
  // for debugging schema mismatches between LLM output and the parser.
  const e = err as { name?: string; issues?: unknown };
  if (e?.name !== 'ZodError' || !Array.isArray(e.issues)) return undefined;
  return (e.issues as Array<{ path?: unknown[]; message?: string; code?: string }>)
    .slice(0, 8)
    .map((issue) => ({
      path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? ''),
      message: issue.message ?? '',
      code: issue.code,
    }));
}

function logLLMError(stage: string, model: string, err: unknown): void {
  const e = err as ErrLike;
  const errorsArr = Array.isArray(e?.errors) ? (e.errors as ErrLike[]) : undefined;
  const cause = e?.cause as ErrLike | undefined;
  const causeOfCause = cause?.cause as ErrLike | undefined;

  // Original combined log line — kept so historical log queries still match.
  console.error(`[ORL.${stage}] FAIL model=${model}`, {
    top: summarizeErr(e),
    cause: summarizeErr(cause),
    causeOfCause: summarizeErr(causeOfCause),
    attempts: errorsArr?.map(summarizeErr),
    zodIssues: summarizeZodIssues(err) ?? summarizeZodIssues(e?.cause),
  });

  // Diagnostic-friendly per-field lines. Vercel's log table preview truncates
  // the multi-line object on the combined line above to ~30 chars, so we also
  // emit each critical field as its own flat-string line. Each gets its own
  // row in the Vercel preview, no JSON truncation hides the actual cause.
  const fmt = (label: string, field: ErrLike | undefined): void => {
    if (!field) return;
    const name = field.name ?? '?';
    const msg = typeof field.message === 'string' ? field.message.slice(0, 300) : '?';
    const status = field.statusCode ?? field.status ?? '';
    const url = field.url ?? '';
    console.error(`[ORL.${stage}.${label}] name=${name} status=${status} url=${url} msg=${msg}`);
  };
  fmt('top', e);
  fmt('cause', cause);
  fmt('cause2', causeOfCause);

  // ResponseBody — if the upstream returned an error body (OpenRouter / xAI / etc.)
  // it usually carries the actionable detail (provider error, model unavailable,
  // out of credits, etc.). Truncated to 500 chars to stay readable in logs.
  const body =
    typeof e.responseBody === 'string'
      ? e.responseBody.slice(0, 500)
      : typeof cause?.responseBody === 'string'
        ? cause.responseBody.slice(0, 500)
        : undefined;
  if (body) console.error(`[ORL.${stage}.body] ${body}`);
}

// DeepInfra-routed traffic for deepseek/deepseek-chat hits a shared free-tier
// rate limit (429 "temporarily rate-limited upstream"). Skip it so OpenRouter
// routes to DeepSeek's own API or other paid providers.
const OPENROUTER_PROVIDER_ROUTING: { ignore: string[] } = {
  ignore: ['DeepInfra'],
};

export class OpenRouterLLMProvider implements LLMProvider {
  private readonly openrouter: ReturnType<typeof createOpenRouter>;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new LLMProviderError('unknown', 'OPENROUTER_API_KEY is not set');
    }
    this.openrouter = createOpenRouter({ apiKey });
  }

  async generateScript(input: ScriptGenInput): Promise<ScriptGenResult> {
    const params = getModelParams('script');
    const start = Date.now();
    const fullPrompt = buildScriptPrompt(input, {
      existingCharacters: input.existingCharacters,
      tier: input.tier ?? 'economy',
      existingVisualTheme: input.existing_visual_theme,
    });
    try {
      const { text, usage } = await generateText({
        model: this.openrouter(params.model),
        prompt: fullPrompt,
        temperature: params.temperature,
        maxOutputTokens: params.max_tokens,
        providerOptions: {
          openrouter: {
            response_format: { type: 'json_object' },
            provider: OPENROUTER_PROVIDER_ROUTING,
          },
        },
      });
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(
          '[ORL.script] no JSON object in response. Raw text head:',
          text.slice(0, 600),
        );
        throw new SyntaxError('No JSON object found in LLM response');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (jsonErr) {
        console.error(
          '[ORL.script] JSON.parse failed. Raw text head:',
          text.slice(0, 600),
          'tail:',
          text.slice(-400),
        );
        throw jsonErr;
      }
      let object: ReturnType<typeof ScriptGenSchema.parse>;
      try {
        object = ScriptGenSchema.parse(parsed);
      } catch (zodErr) {
        // Compact one-line summary + truncated JSON head. Sufficient to spot
        // future LLM-output drift in Vercel logs without excessive payload.
        const zErr = zodErr as {
          issues?: Array<{ path?: unknown[]; code?: string }>;
        };
        const issues = Array.isArray(zErr?.issues) ? zErr.issues : [];
        const summary = issues
          .slice(0, 5)
          .map((i) => {
            const p = Array.isArray(i.path) ? i.path.join('.') : String(i.path ?? '');
            return `${p}:${i.code}`;
          })
          .join(', ');
        console.error(`[ORL.script.zod] ${issues.length} issue(s): ${summary}`);
        console.error('[ORL.script.json head]', JSON.stringify(parsed).slice(0, 500));
        throw zodErr;
      }
      const llmUsage = await this.buildUsage(params.model, usage, start);
      // NOTE: ScriptGenOutput legacy interface still has `master_clip` field; new schema replaces it
      // with master_clip_versions/active_id. Sub-phase C reconciles consumer interfaces.
      return { output: object as unknown as ScriptGenResult['output'], usage: llmUsage };
    } catch (err) {
      logLLMError('script', params.model, err);
      throw classifyLLMError(err);
    }
  }

  async refineScene(input: RefineSceneInput): Promise<RefineSceneResult> {
    const params = getModelParams('refine');
    const start = Date.now();
    try {
      const { text, usage } = await generateText({
        model: this.openrouter(params.model),
        system: REFINE_SYSTEM_PROMPT,
        prompt: buildRefineUserPrompt(input),
        temperature: params.temperature,
        maxOutputTokens: params.max_tokens,
        providerOptions: {
          openrouter: { provider: OPENROUTER_PROVIDER_ROUTING },
        },
      });
      const llmUsage = await this.buildUsage(params.model, usage, start);
      return { output: { updated_description: text.trim() }, usage: llmUsage };
    } catch (err) {
      logLLMError('refine', params.model, err);
      throw classifyLLMError(err);
    }
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    const params = getModelParams('chat');
    const start = Date.now();

    // Apply cache_control to the system message when requested (F86).
    // Anthropic prompt caching is message-level: the OpenRouter provider's
    // convertToOpenRouterChatMessages reads providerOptions on each message,
    // not from the request-level providerOptions.anthropic field.
    const rawMessages = chatMessagesWithSystem(input.messages);
    const messages =
      input.cacheControl === 'ephemeral'
        ? rawMessages.map((msg, idx) =>
            idx === 0 && msg.role === 'system'
              ? { ...msg, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } }
              : msg,
          )
        : rawMessages;

    // Build request-level OpenRouter provider options.
    // Extended thinking (F87) is passed as `thinking` in the OpenRouter request
    // body via restOpenrouterOptions spread — OpenRouter forwards it to Anthropic.
    const thinkingOpt = input.extendedThinking?.budget_tokens
      ? {
          thinking: {
            type: 'enabled' as const,
            budget_tokens: input.extendedThinking.budget_tokens,
          },
        }
      : {};
    const openrouterOpts = { provider: OPENROUTER_PROVIDER_ROUTING, ...thinkingOpt };

    try {
      const { text, usage } = await generateText({
        model: this.openrouter(params.model),
        messages,
        temperature: params.temperature,
        maxOutputTokens: params.max_tokens,
        providerOptions: {
          openrouter: openrouterOpts,
        },
      });
      const llmUsage = await this.buildUsage(params.model, usage, start);
      return { output: { reply: text.trim() }, usage: llmUsage };
    } catch (err) {
      logLLMError('chat', params.model, err);
      throw classifyLLMError(err);
    }
  }

  private async buildUsage(
    model: string,
    sdkUsage: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number } | undefined,
    startMs: number,
  ): Promise<LLMUsage> {
    const prompt_tokens = sdkUsage?.inputTokens ?? 0;
    const completion_tokens = sdkUsage?.outputTokens ?? 0;
    const reasoning_tokens = sdkUsage?.reasoningTokens;
    const cost_usd = await calculateCost(model, prompt_tokens, completion_tokens);
    return {
      prompt_tokens,
      completion_tokens,
      ...(reasoning_tokens !== undefined && { reasoning_tokens }),
      cost_usd,
      model,
      latency_ms: Date.now() - startMs,
    };
  }
}
