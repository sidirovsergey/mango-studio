import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getServerSupabase } from '@mango/db/server';
import { reserveMediaJob } from './rate-limit';

const USER = 'user-abc';
const PROJECT = 'project-xyz';

function makeSb(rpcResult: { data: unknown; error: { message: string } | null } | unknown) {
  const data = (rpcResult as { data?: unknown }).data;
  const error = (rpcResult as { error?: { message: string } | null }).error ?? null;
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MANGO_RATE_LIMIT_ENABLED = undefined;
  process.env.MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY = undefined;
});

describe('reserveMediaJob', () => {
  it('returns mode=reserved when RPC accepts the reservation', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({
        data: [{ job_id: 'job-1', used: 10, allowed: true, dedup: false }],
      }),
    );

    const r = await reserveMediaJob({
      user_id: USER,
      project_id: PROJECT,
      kind: 'first_frame',
      scene_id: 'scene-1',
    });

    expect(r.ok).toBe(true);
    if (r.ok && r.mode === 'reserved') {
      expect(r.job_id).toBe('job-1');
      expect(r.used).toBe(10);
      expect(r.dedup).toBe(false);
    } else {
      throw new Error('expected mode=reserved');
    }
  });

  it('returns mode=reserved with dedup=true when active job already exists', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({
        data: [{ job_id: 'existing-job', used: 0, allowed: true, dedup: true }],
      }),
    );

    const r = await reserveMediaJob({
      user_id: USER,
      project_id: PROJECT,
      kind: 'first_frame',
      scene_id: 'scene-1',
    });

    expect(r.ok).toBe(true);
    if (r.ok && r.mode === 'reserved') {
      expect(r.dedup).toBe(true);
      expect(r.job_id).toBe('existing-job');
    } else {
      throw new Error('expected mode=reserved');
    }
  });

  it('rejects with quota error when allowed=false', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({
        data: [{ job_id: null, used: 50, allowed: false, dedup: false }],
      }),
    );

    const r = await reserveMediaJob({
      user_id: USER,
      project_id: PROJECT,
      kind: 'first_frame',
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('50/50');
    }
  });

  it('respects MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY override', async () => {
    process.env.MANGO_RATE_LIMIT_MEDIA_JOBS_PER_DAY = '5';
    const sb = makeSb({
      data: [{ job_id: null, used: 5, allowed: false, dedup: false }],
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await reserveMediaJob({
      user_id: USER,
      project_id: PROJECT,
      kind: 'video',
    });

    expect(sb.rpc).toHaveBeenCalledWith(
      'reserve_media_job',
      expect.objectContaining({ p_quota_limit: 5 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('5/5');
    }
  });

  it('returns mode=bypass when MANGO_RATE_LIMIT_ENABLED=0 (no RPC call)', async () => {
    process.env.MANGO_RATE_LIMIT_ENABLED = '0';

    const r = await reserveMediaJob({
      user_id: USER,
      project_id: PROJECT,
      kind: 'first_frame',
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe('bypass');
    expect(getServerSupabase).not.toHaveBeenCalled();
  });

  it('degrades to mode=bypass when RPC errors (fail-open, logs warn)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({ data: null, error: { message: 'rpc unreachable' } }),
    );

    const r = await reserveMediaJob({
      user_id: USER,
      project_id: PROJECT,
      kind: 'first_frame',
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe('bypass');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('degrades to mode=bypass when allowed=true but job_id is null (defensive)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeSb({
        data: [{ job_id: null, used: 1, allowed: true, dedup: false }],
      }),
    );

    const r = await reserveMediaJob({
      user_id: USER,
      project_id: PROJECT,
      kind: 'first_frame',
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe('bypass');
    warnSpy.mockRestore();
  });

  it('passes scene_id, character_id, and stale-reservation TTL through to RPC args', async () => {
    const sb = makeSb({
      data: [{ job_id: 'job-x', used: 1, allowed: true, dedup: false }],
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    await reserveMediaJob({
      user_id: USER,
      project_id: PROJECT,
      kind: 'character_dossier',
      character_id: 'char-1',
    });

    expect(sb.rpc).toHaveBeenCalledWith(
      'reserve_media_job',
      expect.objectContaining({
        p_user_id: USER,
        p_project_id: PROJECT,
        p_kind: 'character_dossier',
        p_character_id: 'char-1',
        p_scene_id: null,
        p_stale_reserved_minutes: 5,
      }),
    );
  });
});
