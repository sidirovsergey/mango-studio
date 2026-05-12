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

  it('uses prompt_override when provided (skips builder output)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const project = makeProjectWithVersionedFrame();

    const submitSceneVideo = vi.fn().mockResolvedValue({
      fal_request_id: 'req-ov',
      model_used: 'bytedance/seedance-2.0/image-to-video',
      request_input: { duration_sec: 7 },
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
      job_id: 'j-ov',
      existing: false,
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
    job_id: 'j-snap',
    existing: false,
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

describe('generateSceneVideoAction — per-engine prompt signatures (T7)', () => {
  it('Seedance 2.0: prompt contains [SCENE], [AUDIO], and Avoid:', async () => {
    const prompt = await runAndCapturePrompt('bytedance/seedance-2.0/image-to-video', {
      audio_mode: 'native',
      dialogue: null,
    });
    expect(prompt).toContain('[SCENE]');
    expect(prompt).toContain('[AUDIO]');
    expect(prompt).toContain('Avoid:');
  });

  it('Seedance Lite: prompt contains [SCENE] but NOT [AUDIO]', async () => {
    const prompt = await runAndCapturePrompt('fal-ai/bytedance/seedance/v1/lite/image-to-video');
    expect(prompt).toContain('[SCENE]');
    expect(prompt).not.toContain('[AUDIO]');
  });

  it('Veo 3.1: prompt contains [Cinematography] and [Style]', async () => {
    const prompt = await runAndCapturePrompt('fal-ai/veo3.1/image-to-video', {
      audio_mode: 'native',
      dialogue: null,
    });
    expect(prompt).toContain('[Cinematography]');
    expect(prompt).toContain('[Style]');
  });

  it('Kling 2.5: prompt contains [00:00– beat marker and Reference: @Image1', async () => {
    const prompt = await runAndCapturePrompt(
      'fal-ai/kling-video/v2.5-turbo/standard/image-to-video',
    );
    expect(prompt).toContain('[00:00–');
    expect(prompt).toContain('Reference: @Image1');
  });

  it('LTX: prompt contains Description:, Camera:, and Audio:', async () => {
    const prompt = await runAndCapturePrompt('fal-ai/ltx-video');
    expect(prompt).toContain('Description:');
    expect(prompt).toContain('Camera:');
    expect(prompt).toContain('Audio:');
  });
});

// ---------------------------------------------------------------------------
// F73 regression test — resolved audio_mode must reach per-engine builders
// ---------------------------------------------------------------------------

describe('generateSceneVideoAction — F73 regression (resolved audio_mode)', () => {
  it('scenes already in silent_tts emit F66 quiet-bed line (desired-state documentation)', async () => {
    // NOTE: This is a documentation-of-desired-state test, NOT a bug-catching regression.
    // It passes even if the F73 fix is reverted because raw scene.audio_mode='silent_tts'
    // and resolveAudioMode('silent_tts') return the same value — there is nothing to coerce.
    // The actual bug-catching test is the "auto+Cyrillic" case below.
    const DIALOGUE_TEXT = 'Secret dialogue that must not appear';
    const prompt = await runAndCapturePrompt('bytedance/seedance-2.0/image-to-video', {
      audio_mode: 'silent_tts',
      dialogue: { speaker: 'narrator', text: DIALOGUE_TEXT },
    });
    expect(prompt).not.toContain(DIALOGUE_TEXT);
    // The quiet-bed directive from Seedance 2.0 builder (F66) should appear instead
    expect(prompt).toContain('[AUDIO]');
    expect(prompt).toContain('voice dubbed in post');
  });

  it('F73 critical: auto+Cyrillic dialogue — builder MUST NOT render dialogue text in prompt', async () => {
    // F73 critical: the raw scene.audio_mode is 'auto' but resolveAudioMode coerces it to
    // 'silent_tts' for Cyrillic dialogue. The dispatcher MUST receive the resolved value,
    // not the raw value.
    //
    // With the F73 fix (passing resolved audioMode='silent_tts'):
    //   → builder emits F66 quiet-bed directive; NO dialogue text in prompt.
    // Without the fix (passing raw scene.audio_mode='auto'):
    //   → builder treats 'auto' as 'native', emits Dialogue: narrator — "Секретный диалог…"
    //     in the prompt.
    //
    // This test FAILS when the fix is reverted (audioMode → scene.audio_mode in buildVideoPrompt call).
    const CYRILLIC_DIALOGUE = 'Секретный диалог, который не должен появиться';
    const prompt = await runAndCapturePrompt('bytedance/seedance-2.0/image-to-video', {
      audio_mode: 'auto',
      dialogue: { speaker: 'narrator', text: CYRILLIC_DIALOGUE },
    });
    // The raw dialogue text must NOT appear — resolveAudioMode should have coerced 'auto'→'silent_tts'
    expect(prompt).not.toContain('Секретный диалог');
    // Dialogue: header must NOT appear (that's the native-audio path)
    expect(prompt).not.toContain('Dialogue:');
    // [AUDIO] block must be present (Seedance 2.0 builder structure)
    expect(prompt).toContain('[AUDIO]');
    // F66 quiet-bed directive must appear instead of dialogue rendering
    expect(prompt).toContain('voice dubbed in post');
  });
});
