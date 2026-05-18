import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/server/lib/get-account-tier', () => ({ getAccountTier: vi.fn() }));
vi.mock('@/server/lib/get-balance', () => ({ getBalance: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getAccountTier } from '@/server/lib/get-account-tier';
import { getBalance } from '@/server/lib/get-balance';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { reserveMediaJob } from '@/server/lib/rate-limit';
import { finalizeMediaJobReservation } from '@/server/lib/scene-helpers';
import { getServerSupabase } from '@mango/db/server';
import { generateMasterClipAction } from './generateMasterClipAction';

beforeEach(() => {
  vi.clearAllMocks();
});

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const finalClip = (
  sceneIdx: number,
  video_version_id: string,
  voice_audio_version_id: string | null,
) => ({
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
    scenes: scenesOverride ?? [
      makeScene('s1', finalClip(1, 'v3', 'va2')),
      makeScene('s2', finalClip(2, 'v1', null)),
      makeScene('s3', finalClip(3, 'v2', 'va3')),
    ],
  },
});

describe('generateMasterClipAction', () => {
  it('rejects when not all scenes have final_clip', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const project = makeProject([
      makeScene('s1', finalClip(1, 'v3', 'va2')),
      makeScene('s2', null),
    ]);
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
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(99999);

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
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitMasterConcat,
    });

    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeProject(), error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    });
    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-concat-1',
      used: 1,
      dedup: false,
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
    expect(finalizeMediaJobReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: 'job-concat-1',
        request_input: expect.objectContaining({
          composed: [
            { scene_id: 's1', video_version_id: 'v3', voice_audio_version_id: 'va2' },
            { scene_id: 's2', video_version_id: 'v1', voice_audio_version_id: null },
            { scene_id: 's3', video_version_id: 'v2', voice_audio_version_id: 'va3' },
          ],
        }),
      }),
    );

    // master_clip reservation must carry no scene_id or character_id (it's project-scoped).
    const reserveCall = (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(reserveCall.scene_id).toBeUndefined();
    expect(reserveCall.character_id).toBeUndefined();
    expect(reserveCall.kind).toBe('master_clip');
  });
});

// ---------------------------------------------------------------------------
// Phase 1.6 D3 — account-tier capability gate
// ---------------------------------------------------------------------------

describe('generateMasterClipAction — tier gate', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_GATE_ENFORCE', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const makeProjectBuilder = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: makeProject(), error: null }),
  });

  it('trial user: returns {ok:false, error:"tier_gate", tier_gate:{...}} and never calls reserveMediaJob', async () => {
    // Arrange
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('trial');
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => makeProjectBuilder()),
    });

    // Act
    const result = await generateMasterClipAction({ project_id: PROJECT_ID });

    // Assert: gate returned, reserveMediaJob NOT called
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('tier_gate');
      const r = result as {
        ok: false;
        error: 'tier_gate';
        tier_gate: { required_tier: string; kind: string; message: string };
      };
      expect(r.tier_gate.required_tier).toBe('free');
      expect(r.tier_gate.kind).toBe('master_clip');
      expect(r.tier_gate.message).toBeTruthy();
    }
    expect(reserveMediaJob).not.toHaveBeenCalled();
    expect(getMediaProvider).not.toHaveBeenCalled();
  });

  it('free user: passes the gate and proceeds to reserveMediaJob', async () => {
    // Arrange
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(99999);

    const submitMasterConcat = vi.fn().mockResolvedValue({
      fal_request_id: 'req-free-concat',
      model_used: 'fal-ai/ffmpeg-api/merge-videos',
      request_input: { clip_urls: ['https://cdn.fal.ai/final-1.mp4'] },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitMasterConcat,
    });

    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => makeProjectBuilder()),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-free-concat',
      used: 1,
      dedup: false,
    });

    // Act
    const result = await generateMasterClipAction({ project_id: PROJECT_ID });

    // Assert: gate passed, reserveMediaJob AND submitMasterConcat WERE called
    expect(reserveMediaJob).toHaveBeenCalledTimes(1);
    expect(submitMasterConcat).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 1.7 D4 — balance gate
// ---------------------------------------------------------------------------

describe('generateMasterClipAction — balance gate (Phase 1.7)', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_GATE_ENFORCE', 'true');
    vi.stubEnv('PAYMENTS_GATE_ENFORCE', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const makeProjectBuilder = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: makeProject(), error: null }),
  });

  it('free user with zero balance returns insufficient_balance', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => makeProjectBuilder()),
    });

    const result = await generateMasterClipAction({ project_id: PROJECT_ID });

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
          model_tier: null;
        };
      };
      expect(r.insufficient_balance.required_kopeks).toBe(1000);
      expect(r.insufficient_balance.current_kopeks).toBe(0);
      expect(r.insufficient_balance.kind).toBe('master_clip');
      expect(r.insufficient_balance.model_tier).toBeNull();
    }
    expect(reserveMediaJob).not.toHaveBeenCalled();
  });

  it('free user with sufficient balance (>=1000) passes pre-flight and calls fn_reserve_balance', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1000);

    const submitMasterConcat = vi.fn().mockResolvedValue({
      fal_request_id: 'req-balance-ok',
      model_used: 'fal-ai/ffmpeg-api/merge-videos',
      request_input: {},
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitMasterConcat,
    });

    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => makeProjectBuilder()),
      rpc,
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-balance-ok',
      used: 1,
      dedup: false,
    });

    const result = await generateMasterClipAction({ project_id: PROJECT_ID });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_reserve_balance', {
      p_job_id: 'job-balance-ok',
      p_user_id: 'u1',
      p_kopeks: 1000,
      p_kind: 'master_clip',
      p_model_tier: null,
    });
  });

  it('balance pre-flight passes but fn_reserve_balance returns false → cancels media_job + returns insufficient_balance', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    (getAccountTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('free');
    (getBalance as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1000);

    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === 'media_jobs') return updateChain;
        return makeProjectBuilder();
      }),
      rpc,
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'job-drain',
      used: 1,
      dedup: false,
    });

    const result = await generateMasterClipAction({ project_id: PROJECT_ID });

    expect(updateChain.update).toHaveBeenCalledWith({ status: 'canceled' });
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'job-drain');

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
          model_tier: null;
        };
      };
      expect(r.insufficient_balance.required_kopeks).toBe(1000);
      expect(r.insufficient_balance.kind).toBe('master_clip');
      expect(r.insufficient_balance.model_tier).toBeNull();
    }
  });
});
