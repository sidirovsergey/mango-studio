import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));
vi.mock('@/server/lib/scene-helpers', () => ({
  recordPendingJob: vi.fn(),
  finalizeMediaJobReservation: vi.fn().mockResolvedValue(undefined),
  rollbackMediaJobReservation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/server/lib/rate-limit', () => ({
  reserveMediaJob: vi.fn().mockResolvedValue({
    ok: true,
    mode: 'reserved' as const,
    job_id: 'reserved-id',
    used: 1,
    dedup: false,
  }),
}));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { reserveMediaJob } from '@/server/lib/rate-limit';
import { finalizeMediaJobReservation } from '@/server/lib/scene-helpers';
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

const makeProjectWithVersionedFrame = (
  sceneOverrides: Record<string, unknown> = {},
  scriptOverrides: Record<string, unknown> = {},
) => ({
  id: PROJECT_ID,
  user_id: 'u1',
  tier: 'premium',
  style: '3d_pixar',
  script: {
    title: 'Test',
    master_clip_versions: [],
    master_clip_active_version_id: null,
    characters: [],
    visual_theme: null,
    scenes: [
      {
        scene_id: 's1',
        description: 'Scene 1',
        description_en: 'Scene 1 (English)',
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
    ...scriptOverrides,
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
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-video-1',
      used: 1,
      dedup: false,
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
    expect(finalizeMediaJobReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        request_input: expect.objectContaining({
          first_frame_version_id: 'ff-v2',
          audio_mode: expect.any(String),
        }),
      }),
    );
  });

  it('always resolves to native audio_mode (silent_tts retired 2026-05-13)', async () => {
    // The Cyrillic→silent_tts coercion was removed alongside the ElevenLabs
    // pipeline. Every active model bakes audio in directly, so even Russian
    // dialogue routes through the same native-audio path.
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProjectWithVersionedFrame({
      audio_mode: 'auto',
      dialogue: { speaker: 'narrator', text: 'Привет, друзья!' },
    });

    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'j1',
      used: 1,
      dedup: false,
    });

    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.audio_mode).toBe('native');
  });

  it('uses prompt_override when provided (skips builder output)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const project = makeProjectWithVersionedFrame();

    const submitSceneVideo = vi.fn().mockResolvedValue({
      fal_request_id: 'req-ov',
      model_used: 'bytedance/seedance-2.0/image-to-video',
      request_input: { duration_sec: 7 },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'j-ov',
      used: 1,
      dedup: false,
    });

    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
      prompt_override: 'OVERRIDE VIDEO PROMPT',
    });
    expect(result.ok).toBe(true);
    expect(submitSceneVideo).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'OVERRIDE VIDEO PROMPT' }),
      expect.any(Object),
    );
  });

  it('returns native audio_mode when latin dialogue + native model', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const project = makeProjectWithVersionedFrame({
      audio_mode: 'auto',
      dialogue: { speaker: 'narrator', text: 'Hello world' },
    });

    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'j1',
      used: 1,
      dedup: false,
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

// ---------------------------------------------------------------------------
// E2E snapshot tests — per-engine prompt signature (T7)
// ---------------------------------------------------------------------------

/** Helper: set up mocks + call the action, capture the prompt sent to fal */
async function runAndCapturePrompt(
  model: string,
  sceneOverrides: Record<string, unknown> = {},
  scriptOverrides: Record<string, unknown> = {},
): Promise<string> {
  (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

  const project = makeProjectWithVersionedFrame(sceneOverrides, scriptOverrides);

  const submitSceneVideo = vi.fn().mockResolvedValue({
    fal_request_id: 'req-snap',
    model_used: model,
    request_input: { duration_sec: project.script.scenes[0]!.duration_sec },
  });
  (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
  (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    mode: 'reserved' as const,
    job_id: 'j-snap',
    used: 1,
    dedup: false,
  });

  const result = await generateSceneVideoAction({
    project_id: PROJECT_ID,
    scene_id: 's1',
    model_override: model,
  });

  expect(result.ok).toBe(true);
  expect(submitSceneVideo).toHaveBeenCalledTimes(1);
  const call = submitSceneVideo.mock.calls[0] as [{ prompt: string }, unknown];
  return call[0].prompt;
}

describe('generateSceneVideoAction — unified prompt signature', () => {
  // Post-2026-05-13: per-engine dispatch was retired. Every active model
  // (Grok Imagine Video, Seedance 2.0 Pro, Veo 3.1) runs through one
  // unified builder that emits the [AESTHETIC] / [SCENE] / [SUBJECT] /
  // [ACTION] / [CAMERA] / [AUDIO] / [PERFORMANCE] / [MICRO ACTION] /
  // [Pacing/Style] / Avoid block grammar. Per-engine-specific assertions
  // (Seedance Lite no-audio, Veo's [Cinematography] header, Kling beat
  // markers, LTX label-style) deleted alongside their builders.
  for (const modelId of [
    'xai/grok-imagine-video/image-to-video',
    'bytedance/seedance-2.0/image-to-video',
    'fal-ai/veo3.1/image-to-video',
  ]) {
    it(`${modelId}: prompt carries the unified block grammar`, async () => {
      const prompt = await runAndCapturePrompt(modelId, {
        audio_mode: 'native',
        dialogue: null,
      });
      expect(prompt).toContain('[AESTHETIC]');
      expect(prompt).toContain('[SCENE]');
      expect(prompt).toContain('[SUBJECT]');
      expect(prompt).toContain('[ACTION]');
      expect(prompt).toContain('[CAMERA]');
      expect(prompt).toContain('[AUDIO]');
      expect(prompt).toContain('[MICRO ACTION]');
      expect(prompt).toContain('[Pacing/Style]');
      expect(prompt).toContain('Avoid:');
    });
  }
});

// F73 + F66 regression block retired 2026-05-13 — silent_tts pipeline gone.
// Every scene now routes through native audio; the "no dialogue in [AUDIO]
// block for Cyrillic" invariant is moot because the [AUDIO] block IS the
// dialogue rendering surface now.

describe('generateSceneVideoAction — native audio always (post-rip-out)', () => {
  it('Russian dialogue renders inside [AUDIO] / [PERFORMANCE] alongside ambient + music', async () => {
    const CYRILLIC_DIALOGUE = 'Тестовая русская реплика';
    const prompt = await runAndCapturePrompt('bytedance/seedance-2.0/image-to-video', {
      audio_mode: 'auto',
      dialogue: { speaker: 'narrator', text: CYRILLIC_DIALOGUE },
    });
    // No more silent_tts gate — dialogue text reaches both [AUDIO] and
    // [PERFORMANCE] blocks so the model can render synchronised speech.
    expect(prompt).toContain(CYRILLIC_DIALOGUE);
    expect(prompt).toContain('[AUDIO]');
  });
});
