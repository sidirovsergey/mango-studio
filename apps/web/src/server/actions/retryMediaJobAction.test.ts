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
import { retryMediaJobAction } from './retryMediaJobAction';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('retryMediaJobAction', () => {
  it('marks old job superseded and submits new with same request_input', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });

    const submit = vi.fn().mockResolvedValue({
      fal_request_id: 'req-new',
      model_used: 'm',
      request_input: { prompt: 'x' },
    });
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      submitSceneVideo: submit,
    });

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'old',
          user_id: 'u1',
          project_id: 'p1',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'm',
          request_input: { prompt: 'x' },
          status: 'error',
        },
        error: null,
      }),
      update: vi.fn(() => ({ eq: updateEq })),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    (reserveMediaJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      mode: 'reserved' as const,
      job_id: 'new-job',
      used: 1,
      dedup: false,
    });

    const r = await retryMediaJobAction({ job_id: 'old' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.new_job_id).toBe('new-job');
    expect(submit).toHaveBeenCalled();
    // Old job marked superseded BEFORE reservation (so unique partial index doesn't conflict).
    expect(updateEq).toHaveBeenCalled();
    // Finalize ran with retried fal data.
    expect(finalizeMediaJobReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: 'new-job',
        fal_request_id: 'req-new',
      }),
    );
  });

  it('rejects retrying a non-error job', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'old',
          user_id: 'u1',
          project_id: 'p1',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'm',
          request_input: {},
          status: 'completed',
        },
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const r = await retryMediaJobAction({ job_id: 'old' });
    expect(r.ok).toBe(false);
  });
});
