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

const videoAsset = {
  storage: { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/video.mp4' },
  model: 'bytedance/seedance-2.0/image-to-video',
  generated_at: '2026-01-01T00:00:00Z',
  fal_request_id: 'req-video',
  duration_sec: 7,
  source: 'ai_img2vid' as const,
  has_native_audio: false,
};

const voiceAsset = {
  storage: { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/audio.mp3' },
  tts_provider: 'elevenlabs',
  voice_id: 'narrator-voice-id',
  generated_at: '2026-01-01T00:00:00Z',
  fal_request_id: 'req-voice',
};

const makeProject = (sceneOverrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  script: {
    title: 'Test',
    master_clip: null,
    narrator_voice: { tts_voice_id: 'narrator-voice-id' },
    characters: [],
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        duration_sec: 7,
        dialogue: { speaker: 'narrator', text: 'Once upon a time...' },
        character_ids: [],
        first_frame: null,
        last_frame: null,
        video: videoAsset,
        voice_audio: voiceAsset,
        final_clip: null,
        ...sceneOverrides,
      },
    ],
  },
});

describe('composeSceneFinalClipAction', () => {
  it('rejects when scene uses native-audio model (has_native_audio=true)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const projectNativeAudio = makeProject({
      video: { ...videoAsset, has_native_audio: true },
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: projectNativeAudio, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const result = await composeSceneFinalClipAction({ project_id: PROJECT_ID, scene_id: 's1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/native-audio/i);
    }
  });

  it('submits mux and records final_clip job', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const MUX_MODEL = 'fal-ai/ffmpeg-api/merge-audio-video';

    const submitFinalClipMux = vi.fn().mockResolvedValue({
      fal_request_id: 'req-mux-1',
      model_used: MUX_MODEL,
      request_input: {
        video_url: 'https://cdn.fal.ai/video.mp4',
        audio_url: 'https://cdn.fal.ai/audio.mp3',
      },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitFinalClipMux,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeProject(), error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-mux-1',
      existing: false,
    });

    const result = await composeSceneFinalClipAction({ project_id: PROJECT_ID, scene_id: 's1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job_id).toBe('job-mux-1');
    }

    expect(submitFinalClipMux).toHaveBeenCalledWith(
      expect.objectContaining({
        video_url: 'https://cdn.fal.ai/video.mp4',
        audio_url: 'https://cdn.fal.ai/audio.mp3',
      }),
      expect.objectContaining({ user_id: 'u1', project_id: PROJECT_ID }),
    );

    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        project_id: PROJECT_ID,
        scene_id: 's1',
        kind: 'final_clip',
        fal_request_id: 'req-mux-1',
      }),
    );
  });
});
