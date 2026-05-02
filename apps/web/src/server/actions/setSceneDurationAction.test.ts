import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { setSceneDurationAction } from './setSceneDurationAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// Economy project, no config_overrides — default model is
// 'fal-ai/bytedance/seedance/v1/lite/image-to-video' with duration_options [5, 10].
const makeProject = () => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'economy',
  script: {
    title: 'Test',
    master_clip: null,
    characters: [],
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        duration_sec: 5,
        dialogue: null,
        character_ids: [],
        first_frame_source: 'auto_continuity',
        first_frame: null,
        last_frame: null,
        video: null,
        voice_audio: null,
        final_clip: null,
        // no config_overrides
      },
    ],
  },
});

describe('setSceneDurationAction', () => {
  it('clamps duration 7 → 5 for economy default model (seedance lite: [5, 10])', async () => {
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

    const result = await setSceneDurationAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      duration_sec: 7, // not in [5, 10] — should clamp to 5 (nearest)
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clamped_to).toBe(5);
    }

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          scenes: expect.arrayContaining([
            expect.objectContaining({ duration_sec: 5 }),
          ]),
        }),
      }),
    );
  });

  it('passes through duration 10 unchanged (in [5, 10] for seedance lite)', async () => {
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

    const result = await setSceneDurationAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      duration_sec: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clamped_to).toBe(10);
    }
  });
});
