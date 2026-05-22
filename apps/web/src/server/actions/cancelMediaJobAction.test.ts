import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/server/lib/media-provider-factory', () => ({ getMediaProvider: vi.fn() }));
vi.mock('@mango/db/server', () => ({ getServerSupabase: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { getServerSupabase } from '@mango/db/server';
import { cancelMediaJobAction } from './cancelMediaJobAction';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Build a Supabase mock where:
 *   - first .from('media_jobs').select(...).single() returns the seeded job row.
 *   - subsequent .from('media_jobs').update(...).eq(...) captures the status flip
 *     and returns success.
 */
function makeSb(jobRow: Record<string, unknown>) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  let selectCallCount = 0;
  const sb = {
    from: vi.fn(() => ({
      select: vi.fn(() => {
        selectCallCount++;
        return {
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: jobRow, error: null }),
        };
      }),
      update,
    })),
  };
  return { sb, update, updateEq, selectCallCount: () => selectCallCount };
}

describe('cancelMediaJobAction', () => {
  it('cancels a pending job: calls provider.cancelJob and flips status to cancelled (NOT delete)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const cancelJob = vi.fn().mockResolvedValue(undefined);
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({ cancelJob });

    const { sb, update, updateEq } = makeSb({
      id: 'j1',
      user_id: 'u1',
      fal_request_id: 'req-1',
      model: 'm',
      status: 'pending',
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await cancelMediaJobAction({ job_id: 'j1' });
    expect(r.ok).toBe(true);
    expect(cancelJob).toHaveBeenCalledWith('req-1', 'm');
    // Refund-safe path: status flip, not DELETE — Codex BLOCKER #2 fix.
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(updateEq).toHaveBeenCalledWith('id', 'j1');
  });

  it('cancels a reserved job: skips provider.cancelJob (no real fal request) but still flips status', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const cancelJob = vi.fn().mockResolvedValue(undefined);
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({ cancelJob });

    const { sb, update } = makeSb({
      id: 'j-reserved',
      user_id: 'u1',
      fal_request_id: 'reserved:abc',
      model: 'm',
      status: 'reserved',
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await cancelMediaJobAction({ job_id: 'j-reserved' });
    expect(r.ok).toBe(true);
    // No real fal job exists for a reserved row — provider must not be called
    // with the placeholder request_id.
    expect(cancelJob).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' });
  });

  it('still flips status if provider.cancelJob throws (best-effort cancel)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const cancelJob = vi.fn().mockRejectedValue(new Error('fal 504'));
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({ cancelJob });

    const { sb, update } = makeSb({
      id: 'j2',
      user_id: 'u1',
      fal_request_id: 'req-2',
      model: 'm',
      status: 'running',
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const r = await cancelMediaJobAction({ job_id: 'j2' });
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' });
    warnSpy.mockRestore();
  });

  it('rejects when job belongs to another user', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const { sb, update } = makeSb({
      id: 'j1',
      user_id: 'u2',
      fal_request_id: 'r',
      model: 'm',
      status: 'pending',
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await cancelMediaJobAction({ job_id: 'j1' });
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects terminal-status jobs (completed/cancelled/error) — no double-refund', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const { sb, update } = makeSb({
      id: 'j1',
      user_id: 'u1',
      fal_request_id: 'r',
      model: 'm',
      status: 'completed',
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

    const r = await cancelMediaJobAction({ job_id: 'j1' });
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
