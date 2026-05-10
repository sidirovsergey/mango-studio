import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import { getServerSupabase } from '@mango/db/server';
import { generateMasterClipAction } from './generateMasterClipAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const finalClip = (sceneIdx: number, video_version_id: string, voice_audio_version_id: string | null) => ({
  storage: { kind: 'fal_passthrough' as const, url: `https://cdn.fal.ai/final-${sceneIdx}.mp4` },
  composed_from: { video_version_id, voice_audio_version_id },
});

const makeScene = (id: string, fc: unknown) => ({
  scene_id: id,
  description: `Scene ${id}`,
  duration_sec: 7,
  dialogue: null,
  character_ids: [],
  first_frame_versions: [],
  first_frame_active_version_id: null,
  video_versions: [],
  video_active_version_id: null,
  voice_audio_versions: [],
  voice_audio_active_version_id: null,
  last_frame: null,
  final_clip: fc,
});

const makeProject = (scenesOverride?: unknown[]) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  script: {
    title: 'Test',
    master_clip_versions: [],
    master_clip_active_version_id: null,
    narrator_voice: null,
    characters: [],
    scenes:
      scenesOverride ??
      [
        makeScene('s1', finalClip(1, 'v3', 'va2')),
        makeScene('s2', finalClip(2, 'v1', null)),
        makeScene('s3', finalClip(3, 'v2', 'va3')),
      ],
  },
});

describe('generateMasterClipAction', () => {
  it('rejects when not all scenes have final_clip', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const project = makeProject([makeScene('s1', finalClip(1, 'v3', 'va2')), makeScene('s2', null)]);
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: project, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
    });

    const result = await generateMasterClipAction({ project_id: PROJECT_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/final_clip/i);
  });

  it('submits concat using each scene active final_clip; passes composed metadata', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submitMasterConcat = vi.fn().mockResolvedValue({
      fal_request_id: 'req-concat-1',
      model_used: 'fal-ai/ffmpeg-api/merge-videos',
      request_input: {
        clip_urls: [
          'https://cdn.fal.ai/final-1.mp4',
          'https://cdn.fal.ai/final-2.mp4',
          'https://cdn.fal.ai/final-3.mp4',
        ],
      },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitMasterConcat,
    });

    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeProject(), error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
    });
    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-concat-1',
      existing: false,
    });

    const result = await generateMasterClipAction({ project_id: PROJECT_ID });
    expect(result.ok).toBe(true);
    expect(submitMasterConcat).toHaveBeenCalledWith(
      expect.objectContaining({
        clip_urls: [
          'https://cdn.fal.ai/final-1.mp4',
          'https://cdn.fal.ai/final-2.mp4',
          'https://cdn.fal.ai/final-3.mp4',
        ],
      }),
      expect.objectContaining({ user_id: 'u1' }),
    );
    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'master_clip',
        request_input: expect.objectContaining({
          composed: [
            { scene_id: 's1', video_version_id: 'v3', voice_audio_version_id: 'va2' },
            { scene_id: 's2', video_version_id: 'v1', voice_audio_version_id: null },
            { scene_id: 's3', video_version_id: 'v2', voice_audio_version_id: 'va3' },
          ],
        }),
      }),
    );

    const call = (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.scene_id).toBeUndefined();
    expect(call.character_id).toBeUndefined();
  });
});
