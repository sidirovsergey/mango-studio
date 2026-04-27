import 'server-only';
import { generateObject, generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { getModelParams } from './config';
import { LLMProviderError, classifyLLMError } from './errors';
import { calculateCost } from './pricing';
import {
  REFINE_SYSTEM_PROMPT,
  SCRIPT_SYSTEM_PROMPT,
  buildRefineUserPrompt,
  buildScriptUserPrompt,
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
    try {
      const { object, usage } = await generateObject({
        model: this.openrouter(params.model),
        schema: ScriptGenSchema,
        system: SCRIPT_SYSTEM_PROMPT,
        prompt: buildScriptUserPrompt(input),
        temperature: params.temperature,
        maxOutputTokens: params.max_tokens,
      });
      const llmUsage = await this.buildUsage(params.model, usage, start);
      return { output: object, usage: llmUsage };
    } catch (err) {
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
      });
      const llmUsage = await this.buildUsage(params.model, usage, start);
      return { output: { updated_description: text.trim() }, usage: llmUsage };
    } catch (err) {
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
          anthropic: { cacheControl: { type: 'ephemeral' } },
        },
      });
      const llmUsage = await this.buildUsage(params.model, usage, start);
      return { output: { reply: text.trim() }, usage: llmUsage };
    } catch (err) {
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
