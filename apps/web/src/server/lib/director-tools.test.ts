/**
 * Phase 1.3 Task 37 — smoke tests for 6 new scene chat-tools.
 * Tests the execute() happy paths only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/actions/generateFirstFrameAction', () => ({
  generateFirstFrameAction: vi.fn(),
}));
vi.mock('@/server/actions/regenSceneTextAction', () => ({
  regenSceneTextAction: vi.fn(),
}));
vi.mock('@/server/actions/setSceneDurationAction', () => ({
  setSceneDurationAction: vi.fn(),
}));
vi.mock('@/server/actions/setSceneModelAction', () => ({
  setSceneModelAction: vi.fn(),
}));
// Other director-tools imports that need stubs so module loads
vi.mock('@/server/actions/archiveCharacterAction', () => ({ archiveCharacterAction: vi.fn() }));
vi.mock('@/server/actions/createCharacterAction', () => ({ createCharacterAction: vi.fn() }));
vi.mock('@/server/actions/generateCharacterDossierAction', () => ({
  generateCharacterDossierAction: vi.fn(),
}));
vi.mock('@/server/actions/generateSceneVideoAction', () => ({
  generateSceneVideoAction: vi.fn(),
}));
vi.mock('@/server/actions/generateMasterClipAction', () => ({
  generateMasterClipAction: vi.fn(),
}));
vi.mock('@/server/actions/projects', () => ({ updateProjectMetaAction: vi.fn() }));
vi.mock('@/server/actions/scripts', () => ({
  addSceneAction: vi.fn(),
  deleteSceneAction: vi.fn(),
  refineBeatAction: vi.fn(),
  refineScriptAction: vi.fn(),
  regenScriptAction: vi.fn(),
}));
vi.mock('@/server/actions/unarchiveCharacterAction', () => ({
  unarchiveCharacterAction: vi.fn(),
}));
vi.mock('@/server/actions/deleteCharacterAction', () => ({ deleteCharacterAction: vi.fn() }));
vi.mock('@/server/actions/refineCharacterAction', () => ({ refineCharacterAction: vi.fn() }));

import { generateFirstFrameAction } from '@/server/actions/generateFirstFrameAction';
import { regenSceneTextAction } from '@/server/actions/regenSceneTextAction';
import { setSceneDurationAction } from '@/server/actions/setSceneDurationAction';
import { getServerSupabase } from '@mango/db/server';
import { buildDirectorTools } from './director-tools';

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const SCENE_WITH_FIRST_FRAME = {
  scene_id: 's1',
  description: 'Кот летит на метле над городом',
  duration_sec: 8,
  first_frame: { storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/ff.jpg' } },
  final_clip: null,
};

const SCENE_WITHOUT_FIRST_FRAME = {
  scene_id: 's2',
  description: 'Пустая сцена',
  duration_sec: 5,
  first_frame: null,
  final_clip: null,
};

const SCENE_WITH_FINAL_CLIP = {
  scene_id: 's1',
  description: 'Финальная сцена',
  duration_sec: 8,
  first_frame: { storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/ff.jpg' } },
  final_clip: { storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/clip.mp4' } },
};

function makeSupabaseSingleWith(script: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { script }, error: null }),
    })),
  };
}

type ToolResultShape = {
  ok?: boolean;
  pending?: boolean;
  action?: {
    kind: string;
    payload: Record<string, unknown>;
    preview: { title: string; subject?: string };
    status: string;
  };
  error?: string;
  scene_id?: string;
  job_id?: string;
  existing?: boolean;
  clamped_to?: number;
  dialogue?: { speaker: string; text: string };
};

async function callTool(tool: unknown, input: Record<string, unknown>): Promise<ToolResultShape> {
  const t = tool as { execute: (input: Record<string, unknown>) => Promise<ToolResultShape> };
  return t.execute(input);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('regen_scene_video', () => {
  it('returns pending action when scene has first_frame', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSupabaseSingleWith({ scenes: [SCENE_WITH_FIRST_FRAME] }),
    );

    const tools = buildDirectorTools({ project_id: PROJECT_ID });
    const result = await callTool(tools.regen_scene_video, { scene_id: 's1' });

    expect(result).toMatchObject({
      pending: true,
      action: {
        kind: 'regen_scene_video',
        payload: { project_id: PROJECT_ID, scene_id: 's1' },
        status: 'pending',
      },
    });
    expect(result.action?.preview.title).toContain('s1');
  });

  it('returns error when scene has no first_frame', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSupabaseSingleWith({ scenes: [SCENE_WITHOUT_FIRST_FRAME] }),
    );

    const tools = buildDirectorTools({ project_id: PROJECT_ID });
    const result = await callTool(tools.regen_scene_video, { scene_id: 's2' });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('первого кадра') });
  });
});

describe('refine_scene_description', () => {
  it('returns ok with dialogue on success', async () => {
    (regenSceneTextAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      dialogue: { speaker: 'narrator', text: 'Мяу-мяу!' },
    });

    const tools = buildDirectorTools({ project_id: PROJECT_ID });
    const result = await callTool(tools.refine_scene_description, {
      scene_id: 's1',
      instruction: 'сделай смешнее',
    });

    expect(result).toMatchObject({
      ok: true,
      scene_id: 's1',
      dialogue: { speaker: 'narrator', text: 'Мяу-мяу!' },
    });
  });
});

describe('set_scene_duration', () => {
  it('returns ok with clamped_to on success', async () => {
    (setSceneDurationAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      clamped_to: 8,
    });

    const tools = buildDirectorTools({ project_id: PROJECT_ID });
    const result = await callTool(tools.set_scene_duration, {
      scene_id: 's1',
      duration_sec: 7,
    });

    expect(result).toMatchObject({ ok: true, scene_id: 's1', clamped_to: 8 });
  });
});

describe('set_scene_model', () => {
  it('returns pending action with model info', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSupabaseSingleWith({ scenes: [SCENE_WITH_FIRST_FRAME] }),
    );

    const tools = buildDirectorTools({ project_id: PROJECT_ID });
    const result = await callTool(tools.set_scene_model, {
      scene_id: 's1',
      model: 'fal-ai/veo-3/image-to-video',
    });

    expect(result).toMatchObject({
      pending: true,
      action: {
        kind: 'set_scene_model',
        payload: { project_id: PROJECT_ID, scene_id: 's1', model: 'fal-ai/veo-3/image-to-video' },
        status: 'pending',
      },
    });
    expect(result.action?.preview.subject).toBe('image-to-video');
  });
});

describe('generate_first_frame', () => {
  it('returns ok with job_id on success', async () => {
    (generateFirstFrameAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      job_id: 'job-abc',
      existing: false,
    });

    const tools = buildDirectorTools({ project_id: PROJECT_ID });
    const result = await callTool(tools.generate_first_frame, { scene_id: 's1' });

    expect(result).toMatchObject({ ok: true, scene_id: 's1', job_id: 'job-abc', existing: false });
  });
});

describe('generate_master_clip', () => {
  it('returns pending action when all scenes have final_clip', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSupabaseSingleWith({ scenes: [SCENE_WITH_FINAL_CLIP] }),
    );

    const tools = buildDirectorTools({ project_id: PROJECT_ID });
    const result = await callTool(tools.generate_master_clip, {});

    expect(result).toMatchObject({
      pending: true,
      action: {
        kind: 'generate_master_clip',
        payload: { project_id: PROJECT_ID, scene_count: 1 },
        status: 'pending',
      },
    });
  });

  it('returns error when not all scenes have final_clip', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSupabaseSingleWith({
        scenes: [
          SCENE_WITH_FINAL_CLIP,
          { ...SCENE_WITHOUT_FIRST_FRAME, scene_id: 's2', final_clip: null },
        ],
      }),
    );

    const tools = buildDirectorTools({ project_id: PROJECT_ID });
    const result = await callTool(tools.generate_master_clip, {});

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('1 из 2') });
  });
});
