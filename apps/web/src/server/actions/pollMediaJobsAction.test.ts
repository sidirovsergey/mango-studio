import { beforeEach, describe, expect, it, vi } from 'vitest';

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
        data: {
          user_id: 'u1',
          script: { scenes: [], characters: [], title: 't', master_clip: null },
        },
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

  it('finalizeCompleted appends a first_frame version + emits MirrorHint', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'u1',
    });

    // Project read at top of action
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          user_id: 'u1',
          script: {
            scenes: [
              {
                scene_id: 's1',
                first_frame_versions: [],
                first_frame_active_version_id: null,
                first_frame_source: 'auto_continuity',
              },
            ],
          },
        },
        error: null,
      }),
    };
    // Project read inside finalizeCompleted
    const finalizeProjectRead = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          script: {
            scenes: [
              {
                scene_id: 's1',
                first_frame_versions: [],
                first_frame_active_version_id: null,
                first_frame_source: 'auto_continuity',
              },
            ],
            characters: [],
          },
        },
        error: null,
      }),
    };
    const projectsUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const mediaJobsUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    let projectsCall = 0;
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn((table: string) => {
        if (table === 'projects') {
          projectsCall++;
          if (projectsCall === 1) return projectQuery;
          if (projectsCall === 2) return finalizeProjectRead;
          return projectsUpdate;
        }
        return mediaJobsUpdate;
      }),
      storage: { from: () => ({ remove: vi.fn() }) },
    });

    let captured: Parameters<typeof runPollTick>[1] | undefined;
    (runPollTick as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (_ctx, deps) => {
        captured = deps;
      },
    );

    const result = await pollMediaJobsAction({ project_id: 'p1' });
    expect(result.ok).toBe(true);
    expect(captured).toBeDefined();

    const job = {
      id: 'job-1',
      user_id: 'u1',
      project_id: 'p1',
      scene_id: 's1',
      character_id: null,
      kind: 'first_frame' as const,
      model: 'fal-ai/nano-banana-pro',
      fal_request_id: 'req-1',
      status: 'pending' as const,
      request_input: { prompt: 'a happy mango' },
    };
    const hint = await captured!.finalizeCompleted({
      job,
      result_storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/img.png' },
      cost_usd: 0.01,
      latency_ms: 1234,
    });
    expect(hint).toBeDefined();
    expect(hint?.kind).toBe('first_frame');
    expect(hint?.scene_id).toBe('s1');
    expect(hint?.ext).toBe('png');
    expect(hint?.dropped_supabase_path).toBeUndefined();
    expect(projectsUpdate.update).toHaveBeenCalled();
    // Verify the updated script contains the new version
    const updatePayload = projectsUpdate.update.mock.calls[0]?.[0];
    expect(updatePayload?.script?.scenes[0]?.first_frame_versions?.length).toBe(1);
    expect(updatePayload?.script?.scenes[0]?.first_frame_active_version_id).toBe(
      updatePayload?.script?.scenes[0]?.first_frame_versions[0]?.version_id,
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
