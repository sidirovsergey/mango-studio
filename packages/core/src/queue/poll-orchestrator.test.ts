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
});
