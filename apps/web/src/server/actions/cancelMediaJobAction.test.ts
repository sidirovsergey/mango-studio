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

describe('cancelMediaJobAction', () => {
  it('calls provider.cancelJob and deletes the row', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const cancelJob = vi.fn().mockResolvedValue(undefined);
    (getMediaProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({ cancelJob });

    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'j1',
          user_id: 'u1',
          fal_request_id: 'req-1',
          model: 'm',
          status: 'pending',
        },
        error: null,
      }),
      delete: vi.fn(() => ({ eq: deleteEq })),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const r = await cancelMediaJobAction({ job_id: 'j1' });
    expect(r.ok).toBe(true);
    expect(cancelJob).toHaveBeenCalledWith('req-1', 'm');
  });

  it('rejects when job belongs to another user', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'j1',
          user_id: 'u2',
          fal_request_id: 'r',
          model: 'm',
          status: 'pending',
        },
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const r = await cancelMediaJobAction({ job_id: 'j1' });
    expect(r.ok).toBe(false);
  });

  it('rejects when job is not active', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'j1',
          user_id: 'u1',
          fal_request_id: 'r',
          model: 'm',
          status: 'completed',
        },
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => builder),
    });

    const r = await cancelMediaJobAction({ job_id: 'j1' });
    expect(r.ok).toBe(false);
  });
});
