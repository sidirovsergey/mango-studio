import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/get-user', () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn(),
  getServiceRoleSupabase: vi.fn(),
}));
vi.mock('@mango/core', async () => {
  const actual = await vi.importActual<typeof import('@mango/core')>('@mango/core');
  return { ...actual, runPollTick: vi.fn() };
});
vi.mock('@/server/lib/media-provider-factory', () => ({
  getMediaProvider: vi.fn(() => ({})),
}));
vi.mock('@/server/lib/storage-provider-factory', () => ({
  getStorageProvider: vi.fn(() => ({})),
}));

import { getCurrentUser } from '@/lib/auth/get-user';
import { runPollTick } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { pollMediaJobsAction } from './pollMediaJobsAction';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pollMediaJobsAction', () => {
  it('returns auth error when no session', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('not authenticated'),
    );
    const result = await pollMediaJobsAction({ project_id: 'p1' });
    expect(result.ok).toBe(false);
  });

  it('runs tick when authenticated and project belongs to user', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'u1',
    });
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { user_id: 'u1', script: { scenes: [], characters: [], title: 't', master_clip: null } },
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
    });
    (runPollTick as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const result = await pollMediaJobsAction({ project_id: 'p1' });
    expect(result.ok).toBe(true);
    expect(runPollTick).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'p1', user_id: 'u1' }),
      expect.objectContaining({
        listInflight: expect.any(Function),
        finalizeCompleted: expect.any(Function),
        finalizeError: expect.any(Function),
        recordPendingJob: expect.any(Function),
        persistAsset: expect.any(Function),
        provider: expect.anything(),
      }),
    );
  });

  it('returns forbidden when project belongs to another user', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'u1',
    });
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { user_id: 'someone_else', script: null },
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
    });

    const result = await pollMediaJobsAction({ project_id: 'p1' });
    expect(result.ok).toBe(false);
    expect(runPollTick).not.toHaveBeenCalled();
  });
});
