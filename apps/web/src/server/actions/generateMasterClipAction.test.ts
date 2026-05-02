import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { getServerSupabase } from '@mango/db/server';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import { generateMasterClipAction } from './generateMasterClipAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const finalClipAsset = {
  storage: { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/final.mp4' },
  model: 'fal-ai/ffmpeg-api/merge-audio-video',
  generated_at: '2026-01-01T00:00:00Z',
  fal_request_id: 'req-mux',
};

const finalClipAsset2 = {
  storage: { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/final2.mp4' },
  model: 'fal-ai/ffmpeg-api/merge-audio-video',
  generated_at: '2026-01-01T00:00:00Z',
  fal_request_id: 'req-mux-2',
};

const makeScene = (id: string, finalClip: unknown) => ({
  scene_id: id,
  description: `Scene ${id}`,
  duration_sec: 7,
  dialogue: null,
  character_ids: [],
  first_frame: null,
  last_frame: null,
  video: null,
  voice_audio: null,
  final_clip: finalClip,
});

const makeProject = (scenesOverride?: unknown[]) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  script: {
    title: 'Test',
    master_clip: null,
    narrator_voice: null,
    characters: [],
    scenes: scenesOverride ?? [
      makeScene('s1', finalClipAsset),
      makeScene('s2', finalClipAsset2),
    ],
  },
});

describe('generateMasterClipAction', () => {
  it('rejects when not all scenes have final_clip', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const projectMissingFinalClip = makeProject([
      makeScene('s1', finalClipAsset),
      makeScene('s2', null),
    ]);

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: projectMissingFinalClip, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const result = await generateMasterClipAction({ project_id: PROJECT_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/final_clip/i);
    }
  });

  it('submits concat and records master_clip job (no scene_id, no character_id)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const CONCAT_MODEL = 'fal-ai/ffmpeg-api/merge-videos';

    const submitMasterConcat = vi.fn().mockResolvedValue({
      fal_request_id: 'req-concat-1',
      model_used: CONCAT_MODEL,
      request_input: {
        clip_urls: ['https://cdn.fal.ai/final.mp4', 'https://cdn.fal.ai/final2.mp4'],
      },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitMasterConcat,
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
      job_id: 'job-concat-1',
      existing: false,
    });

    const result = await generateMasterClipAction({ project_id: PROJECT_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job_id).toBe('job-concat-1');
    }

    expect(submitMasterConcat).toHaveBeenCalledWith(
      expect.objectContaining({
        clip_urls: ['https://cdn.fal.ai/final.mp4', 'https://cdn.fal.ai/final2.mp4'],
      }),
      expect.objectContaining({ user_id: 'u1', project_id: PROJECT_ID }),
    );

    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        project_id: PROJECT_ID,
        kind: 'master_clip',
        fal_request_id: 'req-concat-1',
      }),
    );

    // master_clip is project-level — no scene_id or character_id
    const call = (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.scene_id).toBeUndefined();
    expect(call.character_id).toBeUndefined();
  });
});
