import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMProviderError } from './errors';
import { OpenRouterLLMProvider } from './openrouter-provider';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => (modelId: string) => ({ modelId, provider: 'openrouter' }),
}));

vi.mock('./pricing', async () => {
  const actual = await vi.importActual<typeof import('./pricing')>('./pricing');
  return { ...actual, calculateCost: vi.fn(async () => 0.000123) };
});

import { generateText } from 'ai';

const mockGenerateText = vi.mocked(generateText);

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  mockGenerateText.mockReset();
});

afterEach(() => {
  process.env.OPENROUTER_API_KEY = undefined;
});

describe('OpenRouterLLMProvider', () => {
  it('generateScript parses JSON from generateText output via ScriptGenSchema', async () => {
    const scriptObj = {
      title: 'Денни ищет работу',
      scenes: [
        { scene_id: 's1', description: 'Денни плывёт к доске', duration_sec: 8 },
        { scene_id: 's2', description: 'Краб листает резюме', duration_sec: 6 },
      ],
      characters: [{ action: 'add', name: 'Денни', description: 'Дельфин-оптимист' }],
    };
    mockGenerateText.mockResolvedValueOnce({
      text: `Here is the script:\n${JSON.stringify(scriptObj)}`,
      usage: { inputTokens: 250, outputTokens: 320 },
    } as never);

    const p = new OpenRouterLLMProvider();
    const result = await p.generateScript({
      user_prompt: 'дельфин ищет работу',
      format: '9:16',
      duration_sec: 40,
      style: '3d_pixar',
    });

    expect(result.output.title).toBe('Денни ищет работу');
    expect(result.output.scenes).toHaveLength(2);
    expect(result.usage.prompt_tokens).toBe(250);
    expect(result.usage.completion_tokens).toBe(320);
    expect(result.usage.cost_usd).toBe(0.000123);
    expect(result.usage.model).toBe('x-ai/grok-4.1-fast');
    expect(result.usage.latency_ms).toBeGreaterThanOrEqual(0);
    expect(mockGenerateText).toHaveBeenCalledOnce();
  });

  it('refineScene calls generateText, returns updated_description', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Денни печатает плавниками, грустно поглядывая на пузырьки.',
      usage: { inputTokens: 80, outputTokens: 30 },
    } as never);

    const p = new OpenRouterLLMProvider();
    const result = await p.refineScene({
      scene_id: 's1',
      current: 'Денни печатает',
      instruction: 'Добавь эмоций',
    });

    expect(result.output.updated_description).toMatch(/Денни/);
    expect(result.usage.completion_tokens).toBe(30);
    expect(mockGenerateText).toHaveBeenCalledOnce();
  });

  it('chat calls generateText with system prompt prepended + cacheControl', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Привет! Что хочешь сделать?',
      usage: { inputTokens: 200, outputTokens: 15 },
    } as never);

    const p = new OpenRouterLLMProvider();
    const result = await p.chat({
      messages: [{ role: 'user', content: 'Привет' }],
    });

    expect(result.output.reply).toBe('Привет! Что хочешь сделать?');
    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0]![0];
    expect(callArgs.messages?.[0]?.role).toBe('system');
    expect(
      (callArgs.providerOptions?.anthropic?.cacheControl as { type?: string } | undefined)?.type,
    ).toBe('ephemeral');
  });

  it('classifies rate-limit errors via LLMProviderError', async () => {
    const httpErr = Object.assign(new Error('rate limit exceeded'), { status: 429 });
    mockGenerateText.mockRejectedValueOnce(httpErr);

    const p = new OpenRouterLLMProvider();
    await expect(
      p.generateScript({
        user_prompt: 'x',
        format: '9:16',
        duration_sec: 30,
        style: '3d_pixar',
      }),
    ).rejects.toMatchObject({
      code: 'rate_limit',
    });
  });

  it('throws if OPENROUTER_API_KEY is not set', async () => {
    process.env.OPENROUTER_API_KEY = '';
    expect(() => new OpenRouterLLMProvider()).toThrow(LLMProviderError);
  });
});
