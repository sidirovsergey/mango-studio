import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { toggleSceneContinuityAction } from './toggleSceneContinuityAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeSceneBase = (id: string) => ({
  scene_id: id,
  description: `Scene ${id}`,
  duration_sec: 7,
  dialogue: null,
  character_ids: [],
  first_frame_source: 'auto_continuity' as const,
  first_frame: null,
  last_frame: null,
  video: null,
  voice_audio: null,
  final_clip: null,
});

const makeProject = () => ({
  id: PROJECT_ID,
  user_id: 'u1',
  script: {
    title: 'Test',
    master_clip: null,
    characters: [],
    scenes: [makeSceneBase('s1'), makeSceneBase('s2')],
  },
});

const makeSb = (project: ReturnType<typeof makeProject>, updateError: null | Error = null) => {
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  });

  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
      update: updateFn,
    })),
    _updateFn: updateFn,
  };
};

describe('toggleSceneContinuityAction', () => {
  it('rejects on first scene (idx 0)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const sb = makeSb(makeProject());
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const result = await toggleSceneContinuityAction({
      project_id: PROJECT_ID,
      scene_id: 's1', // first scene
      source: 'manual_text2img',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/first scene/i);
    }
  });

  it('accepts on second scene and writes first_frame_source', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProject();
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        update: updateFn,
      })),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const result = await toggleSceneContinuityAction({
      project_id: PROJECT_ID,
      scene_id: 's2', // second scene
      source: 'manual_text2img',
    });

    expect(result.ok).toBe(true);
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          scenes: expect.arrayContaining([
            expect.objectContaining({
              scene_id: 's2',
              first_frame_source: 'manual_text2img',
            }),
          ]),
        }),
      }),
    );
  });
});
