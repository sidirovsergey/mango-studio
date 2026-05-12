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
    const emptySceneVersions = {
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    };
    const scriptObj = {
      title: 'Денни ищет работу',
      scenes: [
        {
          scene_id: 's1',
          description: 'Денни плывёт к доске',
          duration_sec: 8,
          dialogue: { speaker: 'narrator', text: 'Жил-был дельфин Денни.' },
          character_ids: [],
          ...emptySceneVersions,
        },
        {
          scene_id: 's2',
          description: 'Краб листает резюме',
          duration_sec: 6,
          dialogue: null,
          character_ids: [],
          ...emptySceneVersions,
        },
      ],
      characters: [{ action: 'add', name: 'Денни', description: 'Дельфин-оптимист' }],
      master_clip_versions: [],
      master_clip_active_version_id: null,
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

  it('chat calls generateText with system prompt prepended (no cache by default)', async () => {
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
    // System prompt is first message
    expect(callArgs.messages?.[0]?.role).toBe('system');
    // No cacheControl on the system message by default
    const systemMsg = callArgs.messages?.[0] as {
      role: string;
      content: string;
      providerOptions?: Record<string, unknown>;
    };
    expect(systemMsg.providerOptions?.anthropic).toBeUndefined();
    // No anthropic options at request level by default
    expect(callArgs.providerOptions?.anthropic).toBeUndefined();
  });

  it('chat with cacheControl: ephemeral sets cache_control on the system message', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Ответ с кешем',
      usage: { inputTokens: 200, outputTokens: 15 },
    } as never);

    const p = new OpenRouterLLMProvider();
    await p.chat({
      messages: [{ role: 'user', content: 'Привет' }],
      cacheControl: 'ephemeral',
    });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    const systemMsg = callArgs.messages?.[0] as {
      role: string;
      content: string;
      providerOptions?: Record<string, unknown>;
    };
    expect(systemMsg.role).toBe('system');
    expect(
      (systemMsg.providerOptions?.anthropic as Record<string, unknown> | undefined)?.cacheControl,
    ).toEqual({
      type: 'ephemeral',
    });
    // No request-level anthropic options when only cacheControl is set
    expect(callArgs.providerOptions?.anthropic).toBeUndefined();
  });

  it('chat without extendedThinking has no thinking in providerOptions', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Обычный ответ',
      usage: { inputTokens: 100, outputTokens: 10 },
    } as never);

    const p = new OpenRouterLLMProvider();
    await p.chat({
      messages: [{ role: 'user', content: 'Привет' }],
    });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    expect(
      (callArgs.providerOptions?.openrouter as Record<string, unknown> | undefined)?.thinking,
    ).toBeUndefined();
  });

  it('chat with extendedThinking sets thinking on openrouter providerOptions', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Ответ с мышлением',
      usage: { inputTokens: 300, outputTokens: 50, reasoningTokens: 120 },
    } as never);

    const p = new OpenRouterLLMProvider();
    const result = await p.chat({
      messages: [{ role: 'user', content: 'Сложный вопрос' }],
      extendedThinking: { budget_tokens: 2000 },
    });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    const openrouterOpts = callArgs.providerOptions?.openrouter as
      | Record<string, unknown>
      | undefined;
    expect(openrouterOpts?.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 2000,
    });
    expect(result.usage.reasoning_tokens).toBe(120);
  });

  it('chat with both cacheControl and extendedThinking sets both correctly', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Полный ответ',
      usage: { inputTokens: 400, outputTokens: 60, reasoningTokens: 80 },
    } as never);

    const p = new OpenRouterLLMProvider();
    await p.chat({
      messages: [{ role: 'user', content: 'Запрос' }],
      cacheControl: 'ephemeral',
      extendedThinking: { budget_tokens: 1500 },
    });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    // System message gets cache_control
    const systemMsg = callArgs.messages?.[0] as {
      role: string;
      content: string;
      providerOptions?: Record<string, unknown>;
    };
    expect(
      (systemMsg.providerOptions?.anthropic as Record<string, unknown> | undefined)?.cacheControl,
    ).toEqual({
      type: 'ephemeral',
    });
    // openrouter providerOptions gets thinking
    const openrouterOpts = callArgs.providerOptions?.openrouter as
      | Record<string, unknown>
      | undefined;
    expect(openrouterOpts?.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 1500,
    });
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

  it('T6 F24: generateScript with existing_visual_theme passes theme into prompt (prompt contains palette)', async () => {
    // Use the same valid 2-scene, 1-character fixture as the first test to pass ScriptGenSchema.
    const emptySceneVersions = {
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    };
    const scriptObj = {
      title: 'Тест темы',
      scenes: [
        {
          scene_id: 's1',
          description: 'Сцена с темой',
          duration_sec: 10,
          dialogue: null,
          character_ids: [],
          ...emptySceneVersions,
        },
        {
          scene_id: 's2',
          description: 'Вторая сцена',
          duration_sec: 10,
          dialogue: null,
          character_ids: [],
          ...emptySceneVersions,
        },
      ],
      characters: [{ action: 'add', name: 'Кот', description: 'рыжий кот' }],
      master_clip_versions: [],
      master_clip_active_version_id: null,
    };
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(scriptObj),
      usage: { inputTokens: 100, outputTokens: 50 },
    } as never);

    const p = new OpenRouterLLMProvider();
    await p.generateScript({
      user_prompt: 'тест',
      format: '9:16',
      duration_sec: 30,
      style: '3d_pixar',
      existing_visual_theme: {
        palette: ['#aabbcc', '#ddeeff', '#112233'],
        lighting: 'ambient_test',
        lens: '50mm_test',
        motion: 'static_test',
        mood: 'calm_test',
      },
    });

    // The prompt passed to generateText must contain the visual_theme block
    const callArgs = mockGenerateText.mock.calls[0]![0];
    const prompt = callArgs.prompt as string;
    expect(prompt).toContain('<existing_visual_theme>');
    expect(prompt).toContain('#aabbcc');
    expect(prompt).toContain('ambient_test');
  });

  it('T6 F24: generateScript without existing_visual_theme does NOT include the block', async () => {
    const emptySceneVersions = {
      first_frame_versions: [],
      first_frame_active_version_id: null,
      video_versions: [],
      video_active_version_id: null,
      voice_audio_versions: [],
      voice_audio_active_version_id: null,
      last_frame: null,
      final_clip: null,
    };
    const scriptObj = {
      title: 'Без темы',
      scenes: [
        {
          scene_id: 's1',
          description: 'Первая сцена',
          duration_sec: 10,
          dialogue: null,
          character_ids: [],
          ...emptySceneVersions,
        },
        {
          scene_id: 's2',
          description: 'Вторая сцена',
          duration_sec: 10,
          dialogue: null,
          character_ids: [],
          ...emptySceneVersions,
        },
      ],
      characters: [{ action: 'add', name: 'Кот', description: 'кот' }],
      master_clip_versions: [],
      master_clip_active_version_id: null,
    };
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(scriptObj),
      usage: { inputTokens: 100, outputTokens: 50 },
    } as never);

    const p = new OpenRouterLLMProvider();
    await p.generateScript({
      user_prompt: 'тест',
      format: '9:16',
      duration_sec: 30,
      style: '3d_pixar',
    });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    const prompt = callArgs.prompt as string;
    expect(prompt).not.toContain('<existing_visual_theme>');
  });
});
