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
  it('clamps duration 15 → 12 for economy default (seedance 2.0: [4..12])', async () => {
    // 2026-05-26: economy default is now Seedance 2.0 (was Grok), which
    // supports durations [4,5,6,7,8,9,10,12]. 15 is above the max → clamps
    // to 12 (the nearest supported value).
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
      duration_sec: 15, // above max 12 → clamps to 12
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clamped_to).toBe(12);
    }

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          scenes: expect.arrayContaining([expect.objectContaining({ duration_sec: 12 })]),
        }),
      }),
    );
  });

  it('passes through duration 10 unchanged (in [4..12] for seedance 2.0)', async () => {
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
