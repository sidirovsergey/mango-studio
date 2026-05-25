import { describe, expect, it, vi } from 'vitest';
import { type PollDeps, runPollTick } from './poll-orchestrator';

function mkProvider(
  overrides: Partial<{
    status: { status: 'pending' | 'running' | 'completed' | 'error'; error_code?: string };
    result: {
      primary_url: string;
      last_frame_url?: string;
      cost_usd: number | null;
      latency_ms: number;
    };
  }> = {},
) {
  return {
    getJobStatus: vi.fn().mockResolvedValue(overrides.status ?? { status: 'pending' }),
    getJobResult: vi
      .fn()
      .mockResolvedValue(
        overrides.result ?? { primary_url: 'https://x', cost_usd: 0.1, latency_ms: 1000 },
      ),
    submitLastFrameExtract: vi.fn().mockResolvedValue({
      fal_request_id: 'extract-req',
      model_used: 'fal-ai/ffmpeg-api/extract-frame',
      request_input: {},
    }),
  };
}

function mkDeps(overrides: Partial<PollDeps> = {}): PollDeps {
  return {
    listInflight: vi.fn().mockResolvedValue([]),
    finalizeCompleted: vi.fn().mockResolvedValue(undefined),
    finalizeError: vi.fn().mockResolvedValue(undefined),
    recordPendingJob: vi.fn().mockResolvedValue({ job_id: 'extract-job', existing: false }),
    persistAsset: vi.fn().mockResolvedValue({ kind: 'fal_passthrough', url: 'https://persisted' }),
    provider: mkProvider() as unknown as PollDeps['provider'],
    ...overrides,
  };
}

describe('runPollTick', () => {
  it('skips when no inflight jobs', async () => {
    const deps = mkDeps();
    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);
    expect(deps.finalizeCompleted).not.toHaveBeenCalled();
  });

  it('finalizes a completed first_frame job', async () => {
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j1',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'first_frame',
          model: 'fal-ai/nano-banana-pro',
          fal_request_id: 'req-1',
          status: 'pending',
          request_input: {},
        },
      ]),
      provider: mkProvider({
        status: { status: 'completed' },
        result: { primary_url: 'https://ff.png', cost_usd: 0.04, latency_ms: 30000 },
      }) as unknown as PollDeps['provider'],
    });
    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);
    expect(deps.finalizeCompleted).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'j1', kind: 'first_frame' }),
      result_storage: { kind: 'fal_passthrough', url: 'https://persisted' },
      cost_usd: 0.04,
      latency_ms: 30000,
    });
  });

  it('schedules last_frame_extract when video completes without last_frame_url', async () => {
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'jv',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
          fal_request_id: 'req-v',
          status: 'pending',
          request_input: {},
        },
      ]),
      provider: mkProvider({
        status: { status: 'completed' },
        result: {
          primary_url: 'https://video.mp4',
          cost_usd: 0.18,
          latency_ms: 60000,
        },
      }) as unknown as PollDeps['provider'],
      finalizeCompleted: vi.fn().mockResolvedValue({
        project_id: 'p',
        scene_id: 's1',
        version_id: 'video-ver-1',
        kind: 'video',
        ext: 'mp4',
      }),
    });
    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);
    expect(
      (
        deps.provider as unknown as {
          submitLastFrameExtract: ReturnType<typeof vi.fn>;
        }
      ).submitLastFrameExtract,
    ).toHaveBeenCalledWith(
      { video_url: 'https://video.mp4' },
      expect.objectContaining({ user_id: 'u', project_id: 'p' }),
    );
    expect(deps.recordPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'last_frame_extract',
        scene_id: 's1',
        request_input: expect.objectContaining({ video_version_id: 'video-ver-1' }),
      }),
    );
  });

  it('does NOT schedule extract when video result already has last_frame_url', async () => {
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'jv',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
          fal_request_id: 'req-v',
          status: 'pending',
          request_input: {},
        },
      ]),
      provider: mkProvider({
        status: { status: 'completed' },
        result: {
          primary_url: 'https://video.mp4',
          last_frame_url: 'https://lf.png',
          cost_usd: 0.18,
          latency_ms: 60000,
        },
      }) as unknown as PollDeps['provider'],
    });
    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);
    expect(
      (
        deps.provider as unknown as {
          submitLastFrameExtract: ReturnType<typeof vi.fn>;
        }
      ).submitLastFrameExtract,
    ).not.toHaveBeenCalled();
  });

  it('triggers mirror after finalizeCompleted returns a mirror hint', async () => {
    const mirror = vi.fn().mockResolvedValue({ ok: true });
    const deleteStorage = vi.fn().mockResolvedValue(undefined);
    const finalizeCompleted = vi.fn().mockResolvedValue({
      project_id: 'p',
      scene_id: 's1',
      version_id: 'ver-1',
      kind: 'first_frame',
      ext: 'jpg',
    });
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j1',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'first_frame',
          model: 'fal-ai/nano-banana-pro',
          fal_request_id: 'req-1',
          status: 'pending',
          request_input: {},
        },
      ]),
      provider: mkProvider({
        status: { status: 'completed' },
        result: { primary_url: 'https://ff.png', cost_usd: 0.04, latency_ms: 30000 },
      }) as unknown as PollDeps['provider'],
      finalizeCompleted,
      mirror,
      deleteStorage,
    });
    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);
    // Allow microtasks queued by void-promise hooks to flush
    await new Promise((r) => setImmediate(r));
    expect(mirror).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'p',
        scene_id: 's1',
        version_id: 'ver-1',
        kind: 'first_frame',
        ext: 'jpg',
      }),
    );
    expect(deleteStorage).not.toHaveBeenCalled();
  });

  it('triggers deleteStorage when mirror hint reports dropped supabase path', async () => {
    const mirror = vi.fn().mockResolvedValue({ ok: true });
    const deleteStorage = vi.fn().mockResolvedValue(undefined);
    const finalizeCompleted = vi.fn().mockResolvedValue({
      project_id: 'p',
      scene_id: 's1',
      version_id: 'ver-2',
      kind: 'first_frame',
      ext: 'jpg',
      dropped_supabase_path: 'u/p/s1/old-frame.jpg',
    });
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j2',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'first_frame',
          model: 'fal-ai/nano-banana-pro',
          fal_request_id: 'req-2',
          status: 'pending',
          request_input: {},
        },
      ]),
      provider: mkProvider({
        status: { status: 'completed' },
        result: { primary_url: 'https://ff2.png', cost_usd: 0.04, latency_ms: 30000 },
      }) as unknown as PollDeps['provider'],
      finalizeCompleted,
      mirror,
      deleteStorage,
    });
    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);
    await new Promise((r) => setImmediate(r));
    expect(deleteStorage).toHaveBeenCalledWith('u/p/s1/old-frame.jpg');
  });

  it('does NOT call mirror when finalizeCompleted returns void (pre-Sub-phase-C caller)', async () => {
    const mirror = vi.fn().mockResolvedValue({ ok: true });
    const finalizeCompleted = vi.fn().mockResolvedValue(undefined);
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j3',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'first_frame',
          model: 'fal-ai/nano-banana-pro',
          fal_request_id: 'req-3',
          status: 'pending',
          request_input: {},
        },
      ]),
      provider: mkProvider({
        status: { status: 'completed' },
        result: { primary_url: 'https://ff3.png', cost_usd: 0.04, latency_ms: 30000 },
      }) as unknown as PollDeps['provider'],
      finalizeCompleted,
      mirror,
    });
    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);
    await new Promise((r) => setImmediate(r));
    expect(mirror).not.toHaveBeenCalled();
  });

  it('marks errored jobs', async () => {
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'jx',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'm',
          fal_request_id: 'req-x',
          status: 'pending',
          request_input: {},
        },
      ]),
      provider: mkProvider({
        status: { status: 'error', error_code: 'fal_failed' },
      }) as unknown as PollDeps['provider'],
    });
    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);
    expect(deps.finalizeError).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'jx' }),
      error_code: 'fal_failed',
    });
  });

  it('records poll attempts for pending/running jobs', async () => {
    const recordPollAttempt = vi.fn().mockResolvedValue(undefined);
    const now = () => new Date('2026-05-25T12:00:00.000Z');
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'jp',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'm',
          fal_request_id: 'req-p',
          status: 'pending',
          request_input: {},
          created_at: '2026-05-25T11:59:00.000Z',
          poll_count: 2,
        },
      ]),
      provider: mkProvider({
        status: { status: 'running' },
      }) as unknown as PollDeps['provider'],
      recordPollAttempt,
      now,
    });

    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);

    expect(recordPollAttempt).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'jp' }),
      status: 'running',
      polled_at: '2026-05-25T12:00:00.000Z',
    });
    expect(deps.finalizeError).not.toHaveBeenCalled();
  });

  it('marks pending jobs as stuck_in_queue after the per-kind threshold', async () => {
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j-stuck',
          user_id: 'u',
          project_id: 'p',
          scene_id: null,
          character_id: 'c1',
          kind: 'character_dossier',
          model: 'm',
          fal_request_id: 'req-stuck',
          status: 'pending',
          request_input: {},
          created_at: '2026-05-25T11:56:59.000Z',
        },
      ]),
      provider: mkProvider({
        status: { status: 'pending' },
      }) as unknown as PollDeps['provider'],
      recordPollAttempt: vi.fn().mockResolvedValue(undefined),
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);

    expect(deps.finalizeError).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'j-stuck' }),
      error_code: 'stuck_in_queue',
    });
  });

  it('still applies stale detection when heartbeat write fails', async () => {
    const warn = vi.fn();
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j-heartbeat-fail',
          user_id: 'u',
          project_id: 'p',
          scene_id: null,
          character_id: 'c1',
          kind: 'character_dossier',
          model: 'm',
          fal_request_id: 'req-heartbeat-fail',
          status: 'pending',
          request_input: {},
          created_at: '2026-05-25T11:56:59.000Z',
        },
      ]),
      provider: mkProvider({
        status: { status: 'pending' },
      }) as unknown as PollDeps['provider'],
      recordPollAttempt: vi.fn().mockRejectedValue(new Error('db write failed')),
      now: () => new Date('2026-05-25T12:00:00.000Z'),
      warn,
    });

    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);

    expect(warn).toHaveBeenCalledWith(
      '[poll-orchestrator] heartbeat write failed; continuing to stale eval',
      expect.objectContaining({ job_id: 'j-heartbeat-fail', error: 'db write failed' }),
    );
    expect(deps.finalizeError).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'j-heartbeat-fail' }),
      error_code: 'stuck_in_queue',
    });
  });

  it('does not mark running jobs stale even when old', async () => {
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j-running',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'm',
          fal_request_id: 'req-running',
          status: 'running',
          request_input: {},
          created_at: '2026-05-25T11:00:00.000Z',
        },
      ]),
      provider: mkProvider({
        status: { status: 'running' },
      }) as unknown as PollDeps['provider'],
      recordPollAttempt: vi.fn().mockResolvedValue(undefined),
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    });

    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);

    expect(deps.finalizeError).not.toHaveBeenCalled();
  });

  it('continues polling remaining jobs when one job throws', async () => {
    const warn = vi.fn();
    const provider = mkProvider() as unknown as PollDeps['provider'] & {
      getJobStatus: ReturnType<typeof vi.fn>;
    };
    provider.getJobStatus
      .mockRejectedValueOnce(new Error('fal unavailable'))
      .mockResolvedValueOnce({ status: 'error', error_code: 'fal_failed' });
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j-bad',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'm',
          fal_request_id: 'req-bad',
          status: 'pending',
          request_input: {},
        },
        {
          id: 'j-good',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's2',
          character_id: null,
          kind: 'video',
          model: 'm',
          fal_request_id: 'req-good',
          status: 'pending',
          request_input: {},
        },
      ]),
      provider,
      warn,
    });

    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);

    expect(warn).toHaveBeenCalledWith(
      '[poll-orchestrator] job poll failed',
      expect.objectContaining({ job_id: 'j-bad', error: 'fal unavailable' }),
    );
    expect(deps.finalizeError).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'j-good' }),
      error_code: 'fal_failed',
    });
  });

  it('bumps poll_error_count for transient status-check exceptions', async () => {
    const recordPollError = vi.fn().mockResolvedValue(undefined);
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j-transient',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'm',
          fal_request_id: 'req-transient',
          status: 'pending',
          request_input: {},
          poll_error_count: 2,
        },
      ]),
      provider: {
        ...mkProvider(),
        getJobStatus: vi.fn().mockRejectedValue(new Error('fal_status_missing')),
      } as unknown as PollDeps['provider'],
      recordPollError,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
      warn: vi.fn(),
    });

    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);

    expect(recordPollError).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'j-transient' }),
      poll_error_count: 3,
      last_poll_error_at: '2026-05-25T12:00:00.000Z',
      error_message: 'fal_status_missing',
    });
    expect(deps.finalizeError).not.toHaveBeenCalled();
  });

  it('marks jobs poll_unrecoverable after five consecutive status-check exceptions', async () => {
    const markPollUnrecoverable = vi.fn().mockResolvedValue(undefined);
    const deps = mkDeps({
      listInflight: vi.fn().mockResolvedValue([
        {
          id: 'j-unrecoverable',
          user_id: 'u',
          project_id: 'p',
          scene_id: 's1',
          character_id: null,
          kind: 'video',
          model: 'm',
          fal_request_id: 'req-unrecoverable',
          status: 'pending',
          request_input: {},
          poll_error_count: 4,
        },
      ]),
      provider: {
        ...mkProvider(),
        getJobStatus: vi.fn().mockRejectedValue(new Error('permanent poll failure')),
      } as unknown as PollDeps['provider'],
      markPollUnrecoverable,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
      warn: vi.fn(),
    });

    await runPollTick({ project_id: 'p', user_id: 'u' }, deps);

    expect(markPollUnrecoverable).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'j-unrecoverable' }),
      poll_error_count: 5,
      last_poll_error_at: '2026-05-25T12:00:00.000Z',
      error_message: 'permanent poll failure',
    });
  });
});
