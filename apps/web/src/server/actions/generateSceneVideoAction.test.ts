import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { getServerSupabase } from '@mango/db/server';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import { generateSceneVideoAction } from './generateSceneVideoAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const firstFrameAsset = {
  storage: { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/frame.jpg' },
  model: 'fal-ai/nano-banana-pro',
  generated_at: '2026-01-01T00:00:00Z',
  fal_request_id: 'req-ff',
  source: 'ai_text2img' as const,
};

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeProjectWithFrame = (sceneOverrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  style: '3d_pixar',
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
        first_frame: firstFrameAsset,
        last_frame: null,
        video: null,
        voice_audio: null,
        final_clip: null,
        ...sceneOverrides,
      },
    ],
  },
});

describe('generateSceneVideoAction', () => {
  it('rejects when scene has no first_frame', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const projectNoFrame = {
      ...makeProjectWithFrame(),
      script: {
        ...makeProjectWithFrame().script,
        scenes: [
          {
            ...makeProjectWithFrame().script.scenes[0],
            first_frame: null,
          },
        ],
      },
    };

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: projectNoFrame,
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/first_frame/i);
    }
  });

  it('submits image-to-video with duration_sec=7', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const DEFAULT_VIDEO_MODEL = 'bytedance/seedance-2.0/image-to-video';

    const submitSceneVideo = vi.fn().mockResolvedValue({
      fal_request_id: 'req-video-1',
      model_used: DEFAULT_VIDEO_MODEL,
      request_input: { prompt: 'Scene 1', duration_sec: 7 },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitSceneVideo,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: makeProjectWithFrame(),
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-video-1',
      existing: false,
    });

    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job_id).toBe('job-video-1');
    }

    expect(submitSceneVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_VIDEO_MODEL,
        duration_sec: 7,
        aspect_ratio: '9:16',
        first_frame_ref: expect.objectContaining({ kind: 'fal_passthrough' }),
      }),
      expect.objectContaining({ user_id: 'u1', project_id: PROJECT_ID }),
    );

    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        project_id: PROJECT_ID,
        scene_id: 's1',
        kind: 'video',
        fal_request_id: 'req-video-1',
      }),
    );
  });
});
