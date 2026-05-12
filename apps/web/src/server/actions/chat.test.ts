import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (all declared before any imports from the module under test) ---

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUserId: vi.fn() }));
vi.mock('@/server/lib/director-tools', () => ({ buildDirectorTools: vi.fn(() => ({})) }));
vi.mock('@/server/lib/enrich-chips', () => ({ enrichChips: vi.fn(() => []) }));
vi.mock('@/server/lib/extract-tool-steps', () => ({
  extractToolSteps: vi.fn(() => ({ chips: [], pending: null, conflictError: null })),
}));
vi.mock('@/server/lib/log-llm-call', () => ({ logLLMCall: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('ai', () => ({
  generateText: vi.fn(),
  stepCountIs: vi.fn(() => 'step-count-is-sentinel'),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => (modelId: string) => ({ modelId, provider: 'openrouter' }),
}));

vi.mock('@mango/core', async () => {
  const actual = await vi.importActual<typeof import('@mango/core')>('@mango/core');
  return {
    ...actual,
    buildDirectorSystemPrompt: vi.fn(() => 'SYSTEM_PROMPT <!-- CACHE BOUNDARY -->'),
    getModelParams: vi.fn((task: string) => {
      if (task === 'chat') {
        return {
          model: 'anthropic/claude-sonnet-4.6',
          temperature: 0.6,
          max_tokens: 1500,
        };
      }
      return { model: 'x-ai/grok-4.1-fast', temperature: 0.8, max_tokens: 4000 };
    }),
    classifyLLMError: vi.fn((err: unknown) => err),
  };
});

vi.mock('@mango/core/llm/pricing', () => ({
  calculateCost: vi.fn(async () => 0.0005),
}));

import { getCurrentUserId } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { generateText } from 'ai';
import { sendChatMessageAction } from './chat';

const mockGenerateText = vi.mocked(generateText);
const mockGetCurrentUserId = vi.mocked(getCurrentUserId);
const mockGetServerSupabase = vi.mocked(getServerSupabase);

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

/** Build a minimal Supabase mock that handles all queries in sendChatMessageAction */
function makeSupabaseMock() {
  // chat_messages insert (user msg)
  const insertUserMsg = { error: null };
  // projects select
  const projectData = {
    idea: 'мультик про дельфина',
    style: '3d_pixar',
    format: '9:16',
    target_duration_sec: 30,
    script: { characters: [], scenes: [] },
  };
  // chat_messages select (history)
  const historyData = [{ role: 'user', content: 'Привет' }];
  // assistant insert
  const insertAssistant = { error: null };

  let callCount = 0;
  const from = vi.fn(() => {
    callCount++;
    // Call 1: insert user message
    if (callCount === 1) {
      return { insert: vi.fn().mockResolvedValue(insertUserMsg) };
    }
    // Call 2: select project
    if (callCount === 2) {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: projectData, error: null }),
      };
    }
    // Call 3: select chat history
    if (callCount === 3) {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: historyData, error: null }),
      };
    }
    // Call 4: insert assistant message
    return { insert: vi.fn().mockResolvedValue(insertAssistant) };
  });

  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.MANGO_DISABLE_THINKING = undefined;

  mockGetCurrentUserId.mockResolvedValue('user-1');
});

afterEach(() => {
  process.env.OPENROUTER_API_KEY = undefined;
  process.env.MANGO_DISABLE_THINKING = undefined;
});

// ─── T5 tests ──────────────────────────────────────────────────────────────

describe('sendChatMessageAction — caching + thinking (T5)', () => {
  it('T5-1: Sonnet model without env override → thinking enabled in providerOptions', async () => {
    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock() as never);
    mockGenerateText.mockResolvedValueOnce({
      text: 'Привет!',
      steps: [],
      totalUsage: { inputTokens: 100, outputTokens: 20 },
    } as never);

    await sendChatMessageAction({ project_id: PROJECT_ID, content: 'Привет' });

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0]![0];
    const openrouterOpts = callArgs.providerOptions?.openrouter as
      | Record<string, unknown>
      | undefined;
    expect(openrouterOpts?.thinking).toEqual({ type: 'enabled', budget_tokens: 2000 });
  });

  it('T5-2: Sonnet model + MANGO_DISABLE_THINKING=1 → no thinking in providerOptions', async () => {
    process.env.MANGO_DISABLE_THINKING = '1';
    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock() as never);
    mockGenerateText.mockResolvedValueOnce({
      text: 'Привет!',
      steps: [],
      totalUsage: { inputTokens: 100, outputTokens: 20 },
    } as never);

    await sendChatMessageAction({ project_id: PROJECT_ID, content: 'Привет' });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    const openrouterOpts = callArgs.providerOptions?.openrouter as
      | Record<string, unknown>
      | undefined;
    expect(openrouterOpts?.thinking).toBeUndefined();
  });

  it('T5-3: Non-Sonnet model → no thinking even without env override', async () => {
    const { getModelParams } = await import('@mango/core');
    vi.mocked(getModelParams).mockReturnValueOnce({
      model: 'x-ai/grok-4.1-fast',
      temperature: 0.6,
      max_tokens: 1500,
    });

    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock() as never);
    mockGenerateText.mockResolvedValueOnce({
      text: 'Ответ',
      steps: [],
      totalUsage: { inputTokens: 100, outputTokens: 20 },
    } as never);

    await sendChatMessageAction({ project_id: PROJECT_ID, content: 'Привет' });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    const openrouterOpts = callArgs.providerOptions?.openrouter as
      | Record<string, unknown>
      | undefined;
    expect(openrouterOpts?.thinking).toBeUndefined();
  });

  it('T5-4: System message has cacheControl ephemeral marker', async () => {
    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock() as never);
    mockGenerateText.mockResolvedValueOnce({
      text: 'Привет!',
      steps: [],
      totalUsage: { inputTokens: 100, outputTokens: 20 },
    } as never);

    await sendChatMessageAction({ project_id: PROJECT_ID, content: 'Привет' });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    // System message must be in the messages array (not the separate `system` field)
    const msgs = callArgs.messages ?? [];
    const systemMsg = msgs[0] as {
      role: string;
      content: string;
      providerOptions?: Record<string, unknown>;
    };
    expect(systemMsg.role).toBe('system');
    expect(
      (systemMsg.providerOptions?.anthropic as Record<string, unknown> | undefined)?.cacheControl,
    ).toEqual({ type: 'ephemeral' });
    // The top-level `system` field must NOT be set (we're using messages array instead)
    expect((callArgs as Record<string, unknown>).system).toBeUndefined();
  });

  it('T5-5: All other call args are preserved (tools, temperature, maxOutputTokens, stopWhen)', async () => {
    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock() as never);
    mockGenerateText.mockResolvedValueOnce({
      text: 'Ок.',
      steps: [],
      totalUsage: { inputTokens: 50, outputTokens: 10 },
    } as never);

    await sendChatMessageAction({ project_id: PROJECT_ID, content: 'Привет' });

    const callArgs = mockGenerateText.mock.calls[0]![0];
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.temperature).toBe(0.6);
    expect(callArgs.maxOutputTokens).toBe(1500);
    expect(callArgs.stopWhen).toBe('step-count-is-sentinel');
    // DeepInfra ignore is still present
    const openrouterOpts = callArgs.providerOptions?.openrouter as
      | Record<string, unknown>
      | undefined;
    expect((openrouterOpts?.provider as Record<string, unknown> | undefined)?.ignore).toContain(
      'DeepInfra',
    );
  });
});
