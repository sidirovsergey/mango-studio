import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { uploadSceneAssetAction } from './uploadSceneAssetAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('uploadSceneAssetAction', () => {
  it('uploads to bucket and updates jsonb script', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const script = {
      title: 'Test',
      master_clip: null,
      characters: [],
      scenes: [
        {
          scene_id: 's1',
          description: 'Scene 1',
          duration_sec: 8,
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
    };

    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateBuilder = {
      update: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        // chain eq.eq for both project_id and user_id
      })),
    };

    // We need a flexible builder that handles both from('projects') calls
    // (select for ownership check) and (update for script update)
    // plus storage.from('scene-assets').upload
    const selectSingle = vi.fn().mockResolvedValue({
      data: {
        id: PROJECT_ID,
        user_id: 'u1',
        tier: 'premium',
        style: '3d_pixar',
        script,
      },
      error: null,
    });

    const updateResult = { error: null };
    const updateEqChain = vi.fn().mockResolvedValue(updateResult);
    const updateEqFirst = vi.fn(() => ({ eq: updateEqChain }));
    const updateFn = vi.fn(() => ({ eq: updateEqFirst }));

    const projectsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: selectSingle,
      update: updateFn,
    };

    const storageBucket = {
      upload: uploadMock,
    };

    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectsBuilder),
      storage: {
        from: vi.fn(() => storageBucket),
      },
    });

    const file = new File(['fake-png-data'], 'frame.png', { type: 'image/png' });

    const result = await uploadSceneAssetAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      kind: 'first_frame',
      file,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.storage_path).toMatch(new RegExp(`u1/${PROJECT_ID}/s1/first_frame-\\d+\\.png`));
    }

    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`u1/${PROJECT_ID}/s1/first_frame-\\d+\\.png`)),
      file,
      expect.objectContaining({ contentType: 'image/png', upsert: true }),
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          scenes: expect.arrayContaining([
            expect.objectContaining({
              scene_id: 's1',
              first_frame: expect.objectContaining({
                model: 'user_upload',
                source: 'user_upload',
              }),
              first_frame_source: 'user_upload',
            }),
          ]),
        }),
      }),
    );
  });
});
