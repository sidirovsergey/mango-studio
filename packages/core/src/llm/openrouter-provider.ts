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

function logLLMError(stage: string, model: string, err: unknown): void {
  const e = err as ErrLike;
  const errorsArr = Array.isArray(e?.errors) ? (e.errors as ErrLike[]) : undefined;
  console.error(`[ORL.${stage}] FAIL model=${model}`, {
    top: summarizeErr(e),
    cause: summarizeErr(e?.cause as ErrLike),
    causeOfCause: summarizeErr((e?.cause as ErrLike)?.cause as ErrLike),
    attempts: errorsArr?.map(summarizeErr),
  });
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
      if (!jsonMatch) throw new SyntaxError('No JSON object found in LLM response');
      const object = ScriptGenSchema.parse(JSON.parse(jsonMatch[0]));
      const llmUsage = await this.buildUsage(params.model, usage, start);
      return { output: object, usage: llmUsage };
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
    const messages = chatMessagesWithSystem(input.messages);
    try {
      const { text, usage } = await generateText({
        model: this.openrouter(params.model),
        messages,
        temperature: params.temperature,
        maxOutputTokens: params.max_tokens,
        providerOptions: {
          openrouter: { provider: OPENROUTER_PROVIDER_ROUTING },
          anthropic: { cacheControl: { type: 'ephemeral' } },
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
    sdkUsage: { inputTokens?: number; outputTokens?: number } | undefined,
    startMs: number,
  ): Promise<LLMUsage> {
    const prompt_tokens = sdkUsage?.inputTokens ?? 0;
    const completion_tokens = sdkUsage?.outputTokens ?? 0;
    const cost_usd = await calculateCost(model, prompt_tokens, completion_tokens);
    return {
      prompt_tokens,
      completion_tokens,
      cost_usd,
      model,
      latency_ms: Date.now() - startMs,
    };
  }
}
