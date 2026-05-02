import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({ recordPendingJob: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { getServerSupabase } from '@mango/db/server';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  generateFirstFrameAction,
  generateAllFirstFramesAction,
} from './generateFirstFrameAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const makeProject = (sceneOverrides: Record<string, unknown>[] = []) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  style: '3d_pixar',
  script: {
    title: 'Test',
    master_clip: null,
    characters: [
      {
        id: 'char-1',
        name: 'Alice',
        description: 'A test character',
        full_prompt: '',
        appearance: {},
        personality: '',
        voice: {},
        dossier: { storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/dossier.jpg' }, model: 'm', format: '16:9', quality: '1080p', generated_at: '2026-01-01' },
        reference_images: [],
        archived: false,
      },
    ],
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        duration_sec: 8,
        dialogue: null,
        character_ids: ['char-1'],
        first_frame_source: 'auto_continuity',
        first_frame: null,
        last_frame: null,
        video: null,
        voice_audio: null,
        final_clip: null,
        ...sceneOverrides[0],
      },
    ],
  },
});

describe('generateFirstFrameAction', () => {
  it('builds prompt + refs and submits job', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-123',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: { prompt: 'Style: 3D Pixar.' },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitFirstFrame,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: makeProject(),
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-1',
      existing: false,
    });

    const result = await generateFirstFrameAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job_id).toBe('job-1');
      expect(result.existing).toBe(false);
    }

    expect(submitFirstFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('3D Pixar'),
        model: expect.any(String),
        aspect_ratio: '9:16',
        image_refs: expect.arrayContaining([
          expect.objectContaining({ kind: 'fal_passthrough' }),
        ]),
      }),
      expect.objectContaining({ user_id: 'u1', project_id: PROJECT_ID }),
    );

    expect(recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        project_id: PROJECT_ID,
        scene_id: 's1',
        kind: 'first_frame',
        fal_request_id: 'req-123',
      }),
    );
  });

  it('returns existing job_id when same scene+kind already pending', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-456',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      submitFirstFrame,
    });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: makeProject(),
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      job_id: 'job-existing',
      existing: true,
    });

    const result = await generateFirstFrameAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.existing).toBe(true);
      expect(result.job_id).toBe('job-existing');
    }
  });

  it('caps at 5 scenes when more in bulk mode', async () => {
    // 7 scenes, bulk should only submit 5
    const scenes = Array.from({ length: 7 }, (_, i) => ({
      scene_id: `s${i + 1}`,
      description: `Scene ${i + 1}`,
      duration_sec: 5,
      dialogue: null,
      character_ids: [],
      first_frame_source: 'auto_continuity',
      first_frame: null,
      last_frame: null,
      video: null,
      voice_audio: null,
      final_clip: null,
    }));

    const projectWith7Scenes = {
      id: PROJECT_ID,
      user_id: 'u1',
      tier: 'premium',
      style: '3d_pixar',
      script: {
        title: 'Test',
        master_clip: null,
        characters: [],
        scenes,
      },
    };

    // Auth called once for the bulk wrapper, then once per individual scene action (5 times)
    // Total 6 calls to getCurrentUser
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });

    const submitFirstFrame = vi.fn().mockResolvedValue({
      fal_request_id: 'req-bulk',
      model_used: 'fal-ai/nano-banana-pro',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitFirstFrame,
    });

    // getServerSupabase called multiple times — once per action
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: projectWith7Scenes,
          error: null,
        }),
      })),
    });

    (recordPendingJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      job_id: 'job-bulk',
      existing: false,
    });

    const result = await generateAllFirstFramesAction({ project_id: PROJECT_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job_ids).toHaveLength(5);
      expect(result.capped).toBe(true);
    }
    expect(submitFirstFrame).toHaveBeenCalledTimes(5);
  });
});
