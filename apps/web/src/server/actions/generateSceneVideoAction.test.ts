import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
// Phase 1.7 balance reservation calls fn_reserve_balance via service_role
// (sandboxed from user-session for SECURITY DEFINER safety — see action
// docstring). Tests mock both clients so the rpc-chain reads from the
// service-role mock. Default: service-role .rpc returns success; tests can
// override with mockReturnValueOnce as needed.
vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn(),
  getServiceRoleSupabase: vi.fn(() => ({
    rpc: vi.fn(() => Promise.resolve({ data: true, error: null })),
  })),
}));
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
vi.mock('@/server/lib/get-account-tier', () => ({ getAccountTier: vi.fn() }));

vi.mock('@/server/lib/get-balance', () => ({ getBalance: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getAccountTier } from '@/server/lib/get-account-tier';
import { getBalance } from '@/server/lib/get-balance';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { reserveMediaJob } from '@/server/lib/rate-limit';
import {
  finalizeMediaJobReservation,
  rollbackMediaJobReservation,
} from '@/server/lib/scene-helpers';
import { getServerSupabase, getServiceRoleSupabase } from '@mango/db/server';
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
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(99999);

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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(99999);

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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(99999);
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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(99999);

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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
  (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(99999);

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
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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

// ---------------------------------------------------------------------------
// Phase 1.6 D1 — account-tier capability gate
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 1.7 D2 — balance pre-flight + atomic fn_reserve_balance
// ---------------------------------------------------------------------------

describe('generateSceneVideoAction — balance gate', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_GATE_ENFORCE', 'true');
    vi.stubEnv('PAYMENTS_GATE_ENFORCE', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Economy project fixture — config_overrides.tier='economy' so effectiveTier='economy' */
  const makeEconomyProject = () => ({
    ...makeProjectWithVersionedFrame({ config_overrides: { tier: 'economy' } }),
  });

  /** Builds a supabase mock with rpc + optional update chain */
  const makeSupabaseMock = (opts: {
    rpcData: boolean | null;
    rpcError?: null | { message: string };
    updateOk?: boolean;
  }) => {
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    const projectBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeEconomyProject(), error: null }),
    };
    const fromFn = vi.fn((table: string) => {
      if (table === 'media_jobs') return updateChain;
      return projectBuilder;
    });
    const rpcFn = vi.fn().mockResolvedValue({
      data: opts.rpcData,
      error: opts.rpcError ?? null,
    });
    return { sb: { from: fromFn, rpc: rpcFn }, updateChain, projectBuilder };
  };

  it('free user with zero balance returns insufficient_balance, never calls reserveMediaJob or getMediaProvider', async () => {
    // Arrange
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const { sb } = makeSupabaseMock({ rpcData: null });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    // Act
    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    // Assert: gate blocked
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('insufficient_balance');
      const r = result as {
        ok: false;
        error: 'insufficient_balance';
        insufficient_balance: {
          required_kopeks: number;
          current_kopeks: number;
          kind: string;
          model_tier: string | null;
        };
      };
      expect(r.insufficient_balance.required_kopeks).toBe(5000);
      expect(r.insufficient_balance.current_kopeks).toBe(0);
      expect(r.insufficient_balance.kind).toBe('scene_video');
      expect(r.insufficient_balance.model_tier).toBe('economy');
    }
    expect(reserveMediaJob).not.toHaveBeenCalled();
    expect(getMediaProvider).not.toHaveBeenCalled();
  });

  it('free user with sufficient balance passes pre-flight and calls fn_reserve_balance', async () => {
    // Arrange
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5000);

    const { sb } = makeSupabaseMock({ rpcData: true });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);
    // Phase 1.7 balance reservation now runs against the service-role client
    // (SECURITY DEFINER sandboxing). Route the rpc through the same `sb` mock
    // so existing `sb.rpc` assertions still work — service-role and user-session
    // share the test double here.
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(sb);

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-1',
      used: 1,
      dedup: false,
    });

    const submitSceneVideo = vi.fn().mockResolvedValue({
      fal_request_id: 'req-bal',
      model_used: 'bytedance/seedance-2.0/image-to-video',
      request_input: { duration_sec: 7 },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ submitSceneVideo });

    // Act
    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    // Assert: rpc called with correct params, result ok
    expect(sb.rpc).toHaveBeenCalledWith('fn_reserve_balance', {
      p_kind: 'scene_video',
      p_model_tier: 'economy',
      p_kopeks: 5000,
      p_user_id: 'u1',
      p_job_id: 'job-1',
    });
    expect(result.ok).toBe(true);
  });

  it('balance pre-flight passes but fn_reserve_balance returns false → cancels media_job + returns insufficient_balance', async () => {
    // Arrange — balance=5000 passes pre-flight, but rpc signals concurrent drain
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5000);

    const { sb, updateChain } = makeSupabaseMock({ rpcData: false });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(sb);

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-1',
      used: 1,
      dedup: false,
    });

    const submitSceneVideo = vi.fn();
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ submitSceneVideo });

    // Act
    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    // Assert: media_job rolled back, insufficient_balance returned, submit NOT called.
    // 'cancelled' (British) matches the DB CHECK constraint — see action comment.
    expect(updateChain.update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'job-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('insufficient_balance');
    }
    expect(submitSceneVideo).not.toHaveBeenCalled();
  });

  // Codex PR #54 SHOULD-FIX coverage gap: balance was debited via
  // fn_reserve_balance, then provider.submit threw. The action must call
  // rollbackMediaJobReservation so the trigger fires fn_refund_reservation
  // and the user is made whole. Without the rollback-via-UPDATE fix in
  // scene-helpers.ts, this path silently kept the charge.
  it('balance reserved, provider.submitSceneVideo throws → rollback reservation (refund-safe)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5000);

    const { sb } = makeSupabaseMock({ rpcData: true });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(sb);

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-fail',
      used: 1,
      dedup: false,
    });

    const submitSceneVideo = vi.fn().mockRejectedValue(new Error('fal 500 boom'));
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ submitSceneVideo });

    await expect(
      generateSceneVideoAction({ project_id: PROJECT_ID, scene_id: 's1' }),
    ).rejects.toThrow('fal 500 boom');

    // The critical assertion: rollback was called with the reserved job id.
    // Inside scene-helpers, rollback now UPDATEs status='cancelled' (not
    // DELETE), letting tg_billing_settle_on_terminal fire fn_refund_reservation.
    expect(rollbackMediaJobReservation).toHaveBeenCalledWith('job-fail');
  });
});

describe('generateSceneVideoAction — tier gate', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_GATE_ENFORCE', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Builds a supabase mock that satisfies both the project query (from+select+eq+single)
   * and the user_accounts query inside getAccountTier (mocked separately via
   * vi.mock('@/server/lib/get-account-tier')).
   */
  const makeProjectBuilder = () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeProjectWithVersionedFrame(), error: null }),
    };
    return builder;
  };

  it('trial user: returns {ok:false, error:"tier_gate", tier_gate:{...}} and never calls reserveMediaJob', async () => {
    // Arrange
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('trial');
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => makeProjectBuilder()),
    });

    // Act
    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    // Assert: gate returned, reserveMediaJob NOT called
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('tier_gate');
      // Narrowed: tier_gate payload must be present
      const r = result as {
        ok: false;
        error: 'tier_gate';
        tier_gate: { required_tier: string; kind: string; message: string };
      };
      expect(r.tier_gate.required_tier).toBe('free');
      expect(r.tier_gate.kind).toBe('scene_video');
      expect(r.tier_gate.message).toBeTruthy();
    }
    expect(reserveMediaJob).not.toHaveBeenCalled();
    expect(getMediaProvider).not.toHaveBeenCalled();
  });

  it('free user with economy model: passes the gate and proceeds to reserveMediaJob', async () => {
    // Arrange: free tier + economy model (premium project tier, but free user → economy gate check)
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(99999);

    // Economy scene (no tier override → falls back to project tier 'premium',
    // but the project fixture's scene has no config_overrides so effectiveTier
    // is inherited from project.tier which is 'premium' in makeProjectWithVersionedFrame).
    // To properly test free+economy path, use a scene with config_overrides.tier = 'economy'.
    const projectWithEconomy = {
      ...makeProjectWithVersionedFrame({ config_overrides: { tier: 'economy' } }),
    };

    const submitSceneVideo = vi.fn().mockResolvedValue({
      fal_request_id: 'req-free',
      model_used: 'bytedance/seedance-2.0/image-to-video',
      request_input: { duration_sec: 7 },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ submitSceneVideo });

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: projectWithEconomy, error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-free',
      used: 1,
      dedup: false,
    });

    // Act
    const result = await generateSceneVideoAction({
      project_id: PROJECT_ID,
      scene_id: 's1',
    });

    // Assert: gate passed, reserveMediaJob AND submitSceneVideo WERE called
    expect(reserveMediaJob).toHaveBeenCalledTimes(1);
    expect(submitSceneVideo).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});
