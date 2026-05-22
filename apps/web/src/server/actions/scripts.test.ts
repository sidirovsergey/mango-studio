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
    getModelParams: vi.fn(() => ({
      model: 'x-ai/grok-4.1-fast',
      temperature: 0.8,
      max_tokens: 4000,
    })),
  };
});

import { getCurrentUserId } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { generateScriptAction, generateScriptClientAction, refineScriptAction } from './scripts';

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

// ─── Codex audit P2: tier + visual_theme persisted on script-gen ────────────

describe('script-gen actions persist visual_theme + tier (Codex audit P2)', () => {
  // The post-2026-05-13 video prompt builder owns visual_theme via
  // script.tier ?? effectiveTier. If tier is dropped at persistence, downstream
  // prompt assembly silently falls back to economy and reframes the AESTHETIC
  // line as if the user picked the cheaper tier — bypassing the user's choice.
  // Same axis as the visual_theme persistence fix; this regression-pins both.
  it('refineScriptAction writes visual_theme + tier into the persisted jsonb', async () => {
    const project = makeProjectWithTheme(SAMPLE_VISUAL_THEME);
    const updateChain = { eq: vi.fn().mockResolvedValue({ error: null }) };
    const update = vi.fn(() => updateChain);
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        update,
      })),
    };
    mockGetServerSupabase.mockResolvedValue(supabase as never);

    await refineScriptAction({ project_id: PROJECT_ID, instruction: 'сделай ярче' });

    // The first update call carries the script jsonb persisted from the LLM
    // result. We expect both visual_theme AND tier from MINIMAL_SCRIPT_OUTPUT
    // to land verbatim.
    expect(update).toHaveBeenCalled();
    const firstCall = (update as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const updateArg = firstCall[0] as {
      script: { visual_theme: unknown; tier: unknown };
    };
    expect(updateArg.script.visual_theme).toEqual(SAMPLE_VISUAL_THEME);
    expect(updateArg.script.tier).toBe('economy');
  });
});

// ─── 2026-05-22 fix: scene.character_ids name → UUID linkage (Codex audit) ───

describe('script-gen actions persist UUIDs in scene.character_ids[]', () => {
  // The LLM is instructed to emit character NAMES in scene.character_ids[]
  // (see packages/core/src/llm/prompts.ts:156) "until ids are assigned by
  // server". Without `linkSceneCharacterIds` running on persist, downstream
  // first_frame/F53/character-anchoring code paths silently see an empty
  // character set per scene and render visually inconsistent characters
  // across scenes. This integration test pins the post-persist invariant:
  // every entry in scenes[*].character_ids must be a UUID present in
  // characters[*].id.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const SCRIPT_WITH_NAMED_CHARS = {
    output: {
      title: 'История Финна',
      tier: 'economy',
      visual_theme: SAMPLE_VISUAL_THEME,
      scenes: [
        {
          scene_id: 's1',
          description: 'Финн плывёт',
          duration_sec: 10,
          dialogue: null,
          // LLM-style name reference (not UUID).
          character_ids: ['Финн'],
          first_frame_versions: [],
          first_frame_active_version_id: null,
          video_versions: [],
          video_active_version_id: null,
          voice_audio_versions: [],
          voice_audio_active_version_id: null,
          last_frame: null,
          final_clip: null,
        },
        {
          scene_id: 's2',
          description: 'Финн нервничает',
          duration_sec: 8,
          dialogue: null,
          character_ids: ['Финн'],
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
      // applyCharacterActions accepts script-character actions; 'add' is
      // the default for first-gen and the server assigns the UUID.
      characters: [
        {
          action: 'add' as const,
          name: 'Финн',
          description: 'нервный дельфин в галстуке',
          appearance: { palette: ['blue'], distinguishing_features: ['tiny tie'] },
          personality: 'нервный, добрый',
          voice: { description: 'мягкий тенор' },
        },
      ],
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

  it('generateScriptAction swaps LLM-emitted names → character UUIDs in scenes', async () => {
    const project = makeProjectWithTheme(SAMPLE_VISUAL_THEME);
    const updateChain = { eq: vi.fn().mockResolvedValue({ error: null }) };
    const update = vi.fn(() => updateChain);
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        update,
      })),
    };
    mockGetServerSupabase.mockResolvedValue(supabase as never);
    mockGenerateScript.mockResolvedValueOnce(SCRIPT_WITH_NAMED_CHARS);

    await generateScriptAction({ project_id: PROJECT_ID });

    // The first `update` call carries the persisted script jsonb. Its
    // characters[] must have UUIDs assigned by applyCharacterActions, and
    // scenes[*].character_ids[] entries must be those UUIDs (not the LLM
    // names 'Финн').
    expect(update).toHaveBeenCalled();
    const firstCall = (update as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const persisted = firstCall[0] as {
      script: {
        characters: Array<{ id: string; name: string }>;
        scenes: Array<{ scene_id: string; character_ids: string[] }>;
      };
    };
    expect(persisted.script.characters).toHaveLength(1);
    const finnId = persisted.script.characters[0]?.id ?? '';
    expect(finnId).toMatch(UUID_RE);
    expect(persisted.script.scenes[0]?.character_ids).toEqual([finnId]);
    expect(persisted.script.scenes[1]?.character_ids).toEqual([finnId]);
    // Crucially: no scene still carries the raw LLM name.
    for (const s of persisted.script.scenes) {
      expect(s.character_ids).not.toContain('Финн');
    }
  });

  it('refineScriptAction also swaps names → UUIDs on re-persist', async () => {
    const project = makeProjectWithTheme(SAMPLE_VISUAL_THEME);
    const updateChain = { eq: vi.fn().mockResolvedValue({ error: null }) };
    const update = vi.fn(() => updateChain);
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        update,
      })),
    };
    mockGetServerSupabase.mockResolvedValue(supabase as never);
    mockGenerateScript.mockResolvedValueOnce(SCRIPT_WITH_NAMED_CHARS);

    await refineScriptAction({ project_id: PROJECT_ID, instruction: 'сделай ярче' });

    expect(update).toHaveBeenCalled();
    const firstCall = (update as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const persisted = firstCall[0] as {
      script: {
        characters: Array<{ id: string }>;
        scenes: Array<{ character_ids: string[] }>;
      };
    };
    const finnId = persisted.script.characters[0]?.id ?? '';
    expect(finnId).toMatch(UUID_RE);
    expect(persisted.script.scenes[0]?.character_ids).toEqual([finnId]);
    expect(persisted.script.scenes[1]?.character_ids).toEqual([finnId]);
  });
});

describe('script-gen client actions', () => {
  it('returns ok:false instead of throwing a masked Server Components error', async () => {
    const project = makeProjectWithTheme(null);
    mockGetServerSupabase.mockResolvedValue(makeSupabaseMock(project) as never);
    mockGenerateScript.mockRejectedValueOnce(new Error('provider exploded'));

    const result = await generateScriptClientAction({ project_id: PROJECT_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown');
      expect(result.error.message).toContain('provider exploded');
    }
  });
});
