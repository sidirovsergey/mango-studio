import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks declared before imports from module under test ---

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUserId: vi.fn() }));
vi.mock('@/server/lib/log-llm-call', () => ({ logLLMCall: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockGenerateScript = vi.fn();
vi.mock('@mango/core/llm/factory', () => ({
  getLLMProvider: vi.fn(() => ({ generateScript: mockGenerateScript })),
}));

vi.mock('@mango/core', async () => {
  const actual = await vi.importActual<typeof import('@mango/core')>('@mango/core');
  return {
    ...actual,
    classifyLLMError: vi.fn((err: unknown) => err),
    getModelParams: vi.fn(() => ({ model: 'x-ai/grok-4.1-fast', temperature: 0.8, max_tokens: 4000 })),
  };
});

import { getCurrentUserId } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { refineScriptAction } from './scripts';

const mockGetCurrentUserId = vi.mocked(getCurrentUserId);
const mockGetServerSupabase = vi.mocked(getServerSupabase);

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const SAMPLE_VISUAL_THEME = {
  palette: ['#1a1a2e', '#16213e', '#0f3460'],
  lighting: 'noir backlighting',
  lens: '35mm anamorphic',
  motion: 'slow push-in',
  mood: 'тревожный',
};

function makeProjectWithTheme(visualTheme: unknown) {
  return {
    id: PROJECT_ID,
    user_id: 'u1',
    idea: 'кот ищет звезду',
    style: '3d_pixar',
    format: '9:16',
    target_duration_sec: 30,
    tier: 'economy',
    script: {
      title: 'Космокот',
      characters: [],
      scenes: [
        {
          scene_id: 's1',
          description: 'кот смотрит в небо',
          duration_sec: 10,
          dialogue: null,
          character_ids: [],
        },
      ],
      master_clip: null,
      visual_theme: visualTheme,
    },
  };
}

function makeSupabaseMock(project: unknown) {
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
      update: vi.fn(() => updateChain),
    })),
  };
}

const MINIMAL_SCRIPT_OUTPUT = {
  output: {
    title: 'Рефайн тест',
    tier: 'economy',
    visual_theme: SAMPLE_VISUAL_THEME,
    scenes: [
      {
        scene_id: 's1',
        description: 'новая сцена',
        duration_sec: 10,
        dialogue: null,
        character_ids: [],
        first_frame_versions: [],
        first_frame_active_version_id: null,
        video_versions: [],
        video_active_version_id: null,
        voice_audio_versions: [],
        voice_audio_active_version_id: null,
        last_frame: null,
        final_clip: null,
      },
    ],
    characters: [],
    master_clip_versions: [],
    master_clip_active_version_id: null,
  },
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    cost_usd: 0.001,
    model: 'x-ai/grok-4.1-fast',
    latency_ms: 200,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUserId.mockResolvedValue('u1');
  mockGenerateScript.mockResolvedValue(MINIMAL_SCRIPT_OUTPUT);
});

describe('refineScriptAction — F24: visual_theme preservation (T6)', () => {
  it('6. passes project.script.visual_theme as existing_visual_theme to generateScript', async () => {
    const project = makeProjectWithTheme(SAMPLE_VISUAL_THEME);
    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock(project) as never);

    await refineScriptAction({ project_id: PROJECT_ID, instruction: 'сделай грустнее' });

    expect(mockGenerateScript).toHaveBeenCalledOnce();
    const callArg = mockGenerateScript.mock.calls[0]![0];
    expect(callArg.existing_visual_theme).toEqual(SAMPLE_VISUAL_THEME);
  });

  it('7. when project.script.visual_theme is null → existing_visual_theme: null passed (no error)', async () => {
    const project = makeProjectWithTheme(null);
    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock(project) as never);

    await refineScriptAction({ project_id: PROJECT_ID, instruction: 'добавь юмора' });

    expect(mockGenerateScript).toHaveBeenCalledOnce();
    const callArg = mockGenerateScript.mock.calls[0]![0];
    expect(callArg.existing_visual_theme).toBeNull();
  });

  it('8. when project has no script → existing_visual_theme: null passed (no crash)', async () => {
    const project = { ...makeProjectWithTheme(null), script: null };
    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock(project) as never);

    await refineScriptAction({ project_id: PROJECT_ID, instruction: 'тест' });

    expect(mockGenerateScript).toHaveBeenCalledOnce();
    const callArg = mockGenerateScript.mock.calls[0]![0];
    expect(callArg.existing_visual_theme).toBeNull();
  });
});
