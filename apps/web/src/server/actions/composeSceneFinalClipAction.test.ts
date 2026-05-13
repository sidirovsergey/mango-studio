import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import { getServerSupabase } from '@mango/db/server';
import { composeSceneFinalClipAction } from './composeSceneFinalClipAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const videoVersion = (id: string, model = 'bytedance/seedance-2.0/image-to-video') => ({
  version_id: id,
  storage: { kind: 'fal_passthrough' as const, url: `https://cdn.fal.ai/${id}.mp4` },
  prompt: null,
  model,
  generated_at: '2026-01-01T00:00:00Z',
  cost_usd: null,
  has_native_audio: false,
  source: 'auto_continuity' as const,
});
const voiceVersion = (id: string) => ({
  version_id: id,
  storage: { kind: 'fal_passthrough' as const, url: `https://cdn.fal.ai/${id}.mp3` },
  prompt: 'hi',
  model: 'fal-ai/elevenlabs/tts/multilingual-v2',
  generated_at: '2026-01-01T00:00:00Z',
  cost_usd: null,
  source: 'auto_continuity' as const,
});

const makeProject = (sceneOverrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  script: {
    title: 'Test',
    master_clip_versions: [],
    master_clip_active_version_id: null,
    narrator_voice: { tts_voice_id: 'narrator-voice-id' },
    characters: [],
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        duration_sec: 7,
        dialogue: { speaker: 'narrator', text: 'Hello' },
        character_ids: [],
        audio_mode: 'silent_tts',
        first_frame_versions: [],
        first_frame_active_version_id: null,
        video_versions: [videoVersion('v3')],
        video_active_version_id: 'v3',
        voice_audio_versions: [voiceVersion('va2')],
        voice_audio_active_version_id: 'va2',
        last_frame: null,
        final_clip: null,
        ...sceneOverrides,
      },
    ],
  },
});

describe('composeSceneFinalClipAction', () => {
  it('passes through video as final_clip when audio_mode resolves to native', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProject({
      audio_mode: 'native',
      video_versions: [videoVersion('v1', 'fal-ai/veo3.1/image-to-video')],
      video_active_version_id: 'v1',
    });

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    // Helper re-uses Supabase for the native-passthrough update — make the
    // mock sticky so both the action's project-fetch and the helper's
    // update call resolve.
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: vi.fn(() => ({ ...projectQuery, update })),
    });

    const result = await composeSceneFinalClipAction({ project_id: PROJECT_ID, scene_id: 's1' });
    expect(result.ok).toBe(true);
    if (result.ok && 'mode' in result) expect(result.mode).toBe('native_passthrough');
    const payload = update.mock.calls[0]?.[0];
    expect(
      payload?.script?.scenes[0]?.final_clip?.composed_from?.voice_audio_version_id,
    ).toBeNull();
    expect(payload?.script?.scenes[0]?.final_clip?.composed_from?.video_version_id).toBe('v1');
  });

  it('submits mux job with active video + voice version refs', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submitFinalClipMux = vi.fn().mockResolvedValue({
      fal_request_id: 'req-mux-1',
      model_used: 'fal-ai/ffmpeg-api/merge-audio-video',
      request_input: {
        video_url: 'https://cdn.fal.ai/v3.mp4',
        audio_url: 'https://cdn.fal.ai/va2.mp3',
      },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitFinalClipMux,
    });

    const project = makeProject();
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-mux-1',
      existing: false,
    });

    const result = await composeSceneFinalClipAction({ project_id: PROJECT_ID, scene_id: 's1' });
    expect(result.ok).toBe(true);
    expect(submitFinalClipMux).toHaveBeenCalledWith(
      expect.objectContaining({
        video_url: 'https://cdn.fal.ai/v3.mp4',
        audio_url: 'https://cdn.fal.ai/va2.mp3',
      }),
      expect.objectContaining({ user_id: 'u1' }),
    );
    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'final_clip',
        request_input: expect.objectContaining({
          video_version_id: 'v3',
          voice_audio_version_id: 'va2',
        }),
      }),
    );
  });

  it('rejects when scene has no active video', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const project = makeProject({ video_versions: [], video_active_version_id: null });
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
    });

    const result = await composeSceneFinalClipAction({ project_id: PROJECT_ID, scene_id: 's1' });
    expect(result.ok).toBe(false);
  });
});
