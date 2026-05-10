import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import { getServerSupabase } from '@mango/db/server';
import { generateSceneVideoAction } from './generateSceneVideoAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const ffVersion = (overrides: Record<string, unknown> = {}) => ({
  version_id: 'ff-v1',
  storage: { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/frame.jpg' },
  prompt: 'a happy mango',
  model: 'fal-ai/nano-banana-pro',
  generated_at: '2026-01-01T00:00:00Z',
  cost_usd: 0.01,
  source: 'auto_continuity' as const,
  ...overrides,
});

const makeProjectWithVersionedFrame = (sceneOverrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  style: '3d_pixar',
  script: {
    title: 'Test',
    master_clip_versions: [],
    master_clip_active_version_id: null,
    characters: [],
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        duration_sec: 7,
        dialogue: null,
        character_ids: [],
        first_frame_source: 'auto_continuity',
        audio_mode: 'auto',
        first_frame_versions: [ffVersion()],
        first_frame_active_version_id: 'ff-v1',
        video_versions: [],
        video_active_version_id: null,
        voice_audio_versions: [],
        voice_audio_active_version_id: null,
        last_frame: null,
        final_clip: null,
        ...sceneOverrides,
      },
    ],
  },
});

describe('generateSceneVideoAction', () => {
  it('rejects when scene has no active first_frame version', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const empty = makeProjectWithVersionedFrame({
      first_frame_versions: [],
      first_frame_active_version_id: null,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: empty, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/first_frame/i);
  });

  it('uses active first_frame_version as ref when multiple versions exist', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProjectWithVersionedFrame({
      first_frame_versions: [
        ffVersion({ version_id: 'ff-v1' }),
        ffVersion({
          version_id: 'ff-v2',
          storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/v2.jpg' },
        }),
        ffVersion({
          version_id: 'ff-v3',
          storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/v3.jpg' },
        }),
      ],
      first_frame_active_version_id: 'ff-v2',
    });

    const submitSceneVideo = vi.fn().mockResolvedValue({
      fal_request_id: 'req-video-1',
      model_used: 'bytedance/seedance-2.0/image-to-video',
      request_input: { prompt: 'Scene 1', duration_sec: 7 },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitSceneVideo,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
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
    expect(submitSceneVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        first_frame_ref: expect.objectContaining({ url: 'https://cdn.fal.ai/v2.jpg' }),
      }),
      expect.objectContaining({ user_id: 'u1' }),
    );
    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        request_input: expect.objectContaining({
          first_frame_version_id: 'ff-v2',
          audio_mode: expect.any(String),
        }),
      }),
    );
  });

  it('forces silent_tts pipeline when dialogue is Cyrillic + auto', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProjectWithVersionedFrame({
      audio_mode: 'auto',
      dialogue: { speaker: 'narrator', text: 'Привет, друзья!' },
    });

    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitSceneVideo: vi.fn().mockResolvedValue({
        fal_request_id: 'req-1',
        model_used: 'bytedance/seedance-2.0/image-to-video',
        request_input: { duration_sec: 7 },
      }),
    });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'j1',
      existing: false,
    });

    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.audio_mode).toBe('silent_tts');
  });

  it('returns native audio_mode when latin dialogue + native model', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProjectWithVersionedFrame({
      audio_mode: 'auto',
      dialogue: { speaker: 'narrator', text: 'Hello world' },
    });

    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitSceneVideo: vi.fn().mockResolvedValue({
        fal_request_id: 'req-1',
        model_used: 'fal-ai/veo3.1/image-to-video',
        request_input: { duration_sec: 7 },
      }),
    });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'j1',
      existing: false,
    });

    // Pick a model that has_native_audio = true via override
    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      model_override: 'fal-ai/veo3.1/image-to-video',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.audio_mode).toBe('native');
  });
});
