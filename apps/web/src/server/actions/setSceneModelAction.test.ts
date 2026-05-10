import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { setSceneModelAction } from './setSceneModelAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeProject = (tierOverride = 'economy') => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: tierOverride,
  script: {
    title: 'Test',
    master_clip: null,
    characters: [],
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        duration_sec: 7,
        dialogue: null,
        character_ids: [],
        first_frame_source: 'auto_continuity',
        first_frame: null,
        last_frame: null,
        video: null,
        voice_audio: null,
        final_clip: null,
      },
    ],
  },
});

const makeSupabase = (project: ReturnType<typeof makeProject>) => {
  const updateBuilder = {
    eq: vi.fn().mockReturnThis(),
    mockResolveValue: { error: null },
  };
  updateBuilder.eq.mockReturnValue(updateBuilder);
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const selectBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: project, error: null }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'projects') {
        return {
          ...selectBuilder,
          update: updateFn,
        };
      }
      return selectBuilder;
    }),
  };
};

describe('setSceneModelAction', () => {
  it('rejects premium model on economy project', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const sb = makeSupabase(makeProject('economy'));
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const result = await setSceneModelAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      model: 'bytedance/seedance-2.0/image-to-video', // premium model
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not available in tier/i);
    }
  });

  it('accepts economy model on economy project and writes config_overrides', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProject('economy');
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

    const result = await setSceneModelAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      model: 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video', // economy model
    });

    expect(result.ok).toBe(true);
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          scenes: expect.arrayContaining([
            expect.objectContaining({
              config_overrides: expect.objectContaining({
                model: 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video',
              }),
            }),
          ]),
        }),
      }),
    );
  });
});
