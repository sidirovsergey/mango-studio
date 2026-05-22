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
vi.mock('./generateReferenceImageAction', () => ({
  generateReferenceImageAction: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/get-user';
import { type InflightJob, runPollTick } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { generateReferenceImageAction } from './generateReferenceImageAction';
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

  it('finalizeCompleted stores last_frame extracted_from_version_id from video job metadata', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'u1',
    });

    const script = {
      scenes: [
        {
          scene_id: 's1',
          first_frame_active_version_id: 'first-frame-ver-1',
          video_active_version_id: 'video-ver-active',
          last_frame: null,
        },
      ],
      characters: [],
    };

    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { user_id: 'u1', script },
        error: null,
      }),
    };
    const finalizeProjectRead = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { script }, error: null }),
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

    await captured!.finalizeCompleted({
      job: {
        id: 'job-last-frame',
        user_id: 'u1',
        project_id: 'p1',
        scene_id: 's1',
        character_id: null,
        kind: 'last_frame_extract',
        model: 'fal-ai/ffmpeg-api/extract-frame',
        fal_request_id: 'req-last-frame',
        status: 'pending',
        request_input: { video_version_id: 'video-ver-source' },
      },
      result_storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/last.png' },
      cost_usd: 0.001,
      latency_ms: 1000,
    });

    const updatePayload = projectsUpdate.update.mock.calls[0]?.[0];
    expect(updatePayload?.script?.scenes[0]?.last_frame).toEqual({
      storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/last.png' },
      extracted_from_version_id: 'video-ver-source',
    });
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

// ---------------------------------------------------------------------------
// character_dossier → reference_image chain (F53, Task 1.4.D.T3)
// ---------------------------------------------------------------------------

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CHARACTER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const DOSSIER_STORAGE = { kind: 'fal_passthrough' as const, url: 'https://cdn.fal.ai/dossier.png' };

/**
 * Builds a minimal Supabase mock sufficient for finalizeCompleted tests.
 * Returns { sb, projectsUpdate, mediaJobsUpdate } so callers can inspect calls.
 */
function makeSbForFinalize(
  scriptForFinalize: unknown,
  { projectsUpdateError = null }: { projectsUpdateError?: null | { message: string } } = {},
) {
  const projectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { user_id: 'u1', script: scriptForFinalize },
      error: null,
    }),
  };
  const finalizeProjectRead = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { script: scriptForFinalize },
      error: null,
    }),
  };
  const projectsUpdate = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: projectsUpdateError }),
  };
  const mediaJobsUpdate = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  };

  let projectsCall = 0;
  const sb = {
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
  };

  return { sb, projectsUpdate, mediaJobsUpdate };
}

/**
 * Sets up auth + runPollTick capture, calls pollMediaJobsAction,
 * and returns the captured finalizeCompleted callback.
 */
async function captureFinalize(sb: unknown) {
  (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
  (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(sb);

  let captured: Parameters<typeof runPollTick>[1] | undefined;
  (runPollTick as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async (_ctx, deps) => {
      captured = deps;
    },
  );

  const result = await pollMediaJobsAction({ project_id: PROJECT_ID });
  expect(result.ok).toBe(true);
  expect(captured).toBeDefined();
  return captured!;
}

function makeDossierJob(overrides: Partial<InflightJob> = {}): InflightJob {
  return {
    id: 'job-dossier-1',
    user_id: 'u1',
    project_id: PROJECT_ID,
    scene_id: null,
    character_id: CHARACTER_ID,
    kind: 'character_dossier',
    model: 'fal-ai/nano-banana-pro',
    fal_request_id: 'req-dossier-1',
    status: 'pending',
    request_input: { quality: '1080p' },
    ...overrides,
  };
}

describe('pollMediaJobsAction — dossier→reference_image chain (F53)', () => {
  it('1. happy path: dispatches generateReferenceImageAction after character_dossier write', async () => {
    const script = {
      scenes: [],
      characters: [
        {
          id: CHARACTER_ID,
          name: 'Дэнни',
          description: 'test',
          dossier: null,
          reference_images: [],
          voice: {},
        },
      ],
    };

    const { sb } = makeSbForFinalize(script);
    const captured = await captureFinalize(sb);

    (generateReferenceImageAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 'pending',
      job: { kind: 'character_reference_image', request_id: 'req-ref-1' },
    });

    await captured.finalizeCompleted({
      job: makeDossierJob(),
      result_storage: DOSSIER_STORAGE,
      cost_usd: 0.05,
      latency_ms: 2000,
    });

    // Allow fire-and-forget microtasks to settle
    await Promise.resolve();

    expect(generateReferenceImageAction).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });
  });

  it('2. idempotency: does NOT dispatch when dossier.reference_image already set', async () => {
    const existingRefImage = {
      kind: 'fal_passthrough' as const,
      url: 'https://cdn.fal.ai/ref.png',
    };
    const script = {
      scenes: [],
      characters: [
        {
          id: CHARACTER_ID,
          name: 'Дэнни',
          description: 'test',
          dossier: {
            storage: DOSSIER_STORAGE,
            reference_image: existingRefImage,
            model: 'fal-ai/nano-banana-pro',
            format: '16:9',
            quality: '1080p',
            generated_at: '2026-01-01T00:00:00Z',
          },
          reference_images: [],
          voice: {},
        },
      ],
    };

    const { sb } = makeSbForFinalize(script);
    const captured = await captureFinalize(sb);

    await captured.finalizeCompleted({
      job: makeDossierJob(),
      result_storage: DOSSIER_STORAGE,
      cost_usd: 0.05,
      latency_ms: 2000,
    });

    await Promise.resolve();

    expect(generateReferenceImageAction).not.toHaveBeenCalled();
  });

  it('3. resilience: dossier write succeeds even if ref image dispatch returns {ok:false}', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const script = {
      scenes: [],
      characters: [
        {
          id: CHARACTER_ID,
          name: 'Дэнни',
          description: 'test',
          dossier: null,
          reference_images: [],
          voice: {},
        },
      ],
    };

    const { sb, mediaJobsUpdate } = makeSbForFinalize(script);
    const captured = await captureFinalize(sb);

    (generateReferenceImageAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: 'fal_timeout',
    });

    // Should NOT throw
    await expect(
      captured.finalizeCompleted({
        job: makeDossierJob(),
        result_storage: DOSSIER_STORAGE,
        cost_usd: 0.05,
        latency_ms: 2000,
      }),
    ).resolves.not.toThrow();

    await Promise.resolve();

    // media_jobs update still happened (dossier IS saved)
    expect(mediaJobsUpdate.update).toHaveBeenCalled();
    // Failure was logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('post-dossier reference image dispatch failed'),
      expect.objectContaining({ project_id: PROJECT_ID, character_id: CHARACTER_ID }),
    );

    warnSpy.mockRestore();
  });

  it('4. resilience: dossier write succeeds even if ref image dispatch throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const script = {
      scenes: [],
      characters: [
        {
          id: CHARACTER_ID,
          name: 'Дэнни',
          description: 'test',
          dossier: null,
          reference_images: [],
          voice: {},
        },
      ],
    };

    const { sb, mediaJobsUpdate } = makeSbForFinalize(script);
    const captured = await captureFinalize(sb);

    (generateReferenceImageAction as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error'),
    );

    // Should NOT throw
    await expect(
      captured.finalizeCompleted({
        job: makeDossierJob(),
        result_storage: DOSSIER_STORAGE,
        cost_usd: 0.05,
        latency_ms: 2000,
      }),
    ).resolves.not.toThrow();

    // Allow the .catch() clause to run
    await Promise.resolve();
    await Promise.resolve();

    // media_jobs update still happened
    expect(mediaJobsUpdate.update).toHaveBeenCalled();
    // Network error was caught and logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('post-dossier reference image dispatch threw'),
      expect.objectContaining({ project_id: PROJECT_ID, character_id: CHARACTER_ID }),
    );

    warnSpy.mockRestore();
  });

  it('5. non-dossier job kinds do NOT trigger the chain', async () => {
    const script = {
      scenes: [
        {
          scene_id: 's1',
          first_frame_versions: [],
          first_frame_active_version_id: null,
          first_frame_source: 'auto_continuity',
        },
      ],
      characters: [],
    };

    const { sb } = makeSbForFinalize(script);
    const captured = await captureFinalize(sb);

    await captured.finalizeCompleted({
      job: {
        id: 'job-ff-1',
        user_id: 'u1',
        project_id: PROJECT_ID,
        scene_id: 's1',
        character_id: null,
        kind: 'first_frame' as const,
        model: 'fal-ai/nano-banana-pro',
        fal_request_id: 'req-ff-1',
        status: 'pending' as const,
        request_input: { prompt: 'test' },
      },
      result_storage: { kind: 'fal_passthrough', url: 'https://cdn.fal.ai/ff.png' },
      cost_usd: 0.01,
      latency_ms: 500,
    });

    await Promise.resolve();

    expect(generateReferenceImageAction).not.toHaveBeenCalled();
  });

  it('5b. character_avatar job does NOT trigger the chain', async () => {
    const script = {
      scenes: [],
      characters: [
        {
          id: CHARACTER_ID,
          name: 'Дэнни',
          description: 'test',
          dossier: null,
          reference_images: [],
          voice: {},
        },
      ],
    };

    const { sb } = makeSbForFinalize(script);
    const captured = await captureFinalize(sb);

    await captured.finalizeCompleted({
      job: makeDossierJob({ kind: 'character_avatar' }),
      result_storage: DOSSIER_STORAGE,
      cost_usd: 0.05,
      latency_ms: 2000,
    });

    await Promise.resolve();

    expect(generateReferenceImageAction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skipReferenceRecovery option (added 2026-05-22 for CJM reconcile loop;
// see Codex audit on PR #51, SHOULD-FIX #2)
// ---------------------------------------------------------------------------

/**
 * Script with one character that has a dossier but no reference_image —
 * exactly the shape `triggerMissingReferenceImageJobs` filters for. When the
 * pre-tick recovery is NOT skipped, this should dispatch generateReferenceImageAction.
 */
const SCRIPT_NEEDING_RETROACTIVE_REF: Record<string, unknown> = {
  scenes: [],
  characters: [
    {
      id: CHARACTER_ID,
      name: 'Дэнни',
      description: 'test',
      dossier: {
        storage: DOSSIER_STORAGE,
        reference_image: null,
        model: 'fal-ai/nano-banana-pro',
        format: '16:9',
        quality: '1080p',
        generated_at: '2026-01-01T00:00:00Z',
      },
      reference_images: [],
      voice: {},
    },
  ],
};

describe('pollMediaJobsAction — skipReferenceRecovery option', () => {
  it('skips triggerMissingReferenceImageJobs when skipReferenceRecovery=true', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { user_id: 'u1', script: SCRIPT_NEEDING_RETROACTIVE_REF },
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
    });
    (runPollTick as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const result = await pollMediaJobsAction({
      project_id: PROJECT_ID,
      skipReferenceRecovery: true,
    });

    expect(result.ok).toBe(true);
    expect(runPollTick).toHaveBeenCalled();
    // The retroactive recovery branch never fires when the flag is true,
    // even though the character has dossier && !reference_image.
    expect(generateReferenceImageAction).not.toHaveBeenCalled();
  });

  it('fires triggerMissingReferenceImageJobs by default (skipReferenceRecovery undefined)', async () => {
    (getCurrentUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'u1' });
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { user_id: 'u1', script: SCRIPT_NEEDING_RETROACTIVE_REF },
        error: null,
      }),
    };
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: vi.fn(() => projectQuery),
    });
    (runPollTick as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (generateReferenceImageAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 'pending',
      job: { kind: 'character_reference_image', request_id: 'req-ref-default' },
    });

    const result = await pollMediaJobsAction({ project_id: PROJECT_ID });

    expect(result.ok).toBe(true);
    // Default workspace polling path: F53 retroactive recovery DOES fire.
    expect(generateReferenceImageAction).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      character_id: CHARACTER_ID,
    });
  });
});
