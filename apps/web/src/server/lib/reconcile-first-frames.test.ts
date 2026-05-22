import { describe, expect, it, vi } from 'vitest';
import { type ReconcileDeps, reconcileFirstFrames } from './reconcile-first-frames';

const PROJECT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

/** Build a `now()` that returns monotonically increasing virtual time. */
function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/**
 * Build deps where `sleep` is instantaneous but advances the clock — so
 * `now() - start` reaches the budget after the simulated number of ticks.
 */
function makeDeps(overrides: Partial<ReconcileDeps> = {}): {
  deps: ReconcileDeps;
  clock: ReturnType<typeof makeClock>;
} {
  const clock = makeClock();
  const deps: ReconcileDeps = {
    poll: vi.fn().mockResolvedValue({ ok: true }),
    listInflight: vi.fn().mockResolvedValue({ ok: true, remaining: 0 }),
    sleep: vi.fn(async (ms: number) => {
      clock.advance(ms);
    }),
    now: () => clock.now(),
    ...overrides,
  };
  return { deps, clock };
}

describe('reconcileFirstFrames', () => {
  it('returns completed when inflight reaches 0 on the first tick', async () => {
    const { deps } = makeDeps();
    const result = await reconcileFirstFrames({ project_id: PROJECT_ID }, deps);

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.ticks).toBe(1);
    }
    expect(deps.poll).toHaveBeenCalledTimes(1);
    expect(deps.listInflight).toHaveBeenCalledTimes(1);
  });

  it('exits with poll_failed when poll returns ok:false (auth/permission)', async () => {
    const { deps } = makeDeps({
      poll: vi.fn().mockResolvedValue({ ok: false, error: 'unauthorized' }),
    });
    const result = await reconcileFirstFrames({ project_id: PROJECT_ID }, deps);

    expect(result.status).toBe('poll_failed');
    if (result.status === 'poll_failed') {
      expect(result.error).toBe('unauthorized');
      expect(result.ticks).toBe(1);
    }
    // Bails immediately — never inspects inflight after auth failure.
    expect(deps.listInflight).not.toHaveBeenCalled();
  });

  it('continues ticking when poll throws (transient fal/db blip)', async () => {
    const poll = vi
      .fn()
      .mockRejectedValueOnce(new Error('fal blip'))
      .mockResolvedValueOnce({ ok: true });
    const listInflight = vi.fn().mockResolvedValue({ ok: true, remaining: 0 });
    const { deps } = makeDeps({ poll, listInflight });
    // Suppress expected console.warn.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reconcileFirstFrames({ project_id: PROJECT_ID }, deps);

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.ticks).toBe(2);
    }
    expect(poll).toHaveBeenCalledTimes(2);
    // First tick threw before listInflight ran; second tick succeeded and
    // listInflight returned remaining=0 → loop exit. 1 call total.
    expect(listInflight).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('exits with query_failed when listInflight returns ok:false', async () => {
    const { deps } = makeDeps({
      listInflight: vi.fn().mockResolvedValue({ ok: false, error: 'db down' }),
    });
    const result = await reconcileFirstFrames({ project_id: PROJECT_ID }, deps);

    expect(result.status).toBe('query_failed');
    if (result.status === 'query_failed') {
      expect(result.error).toBe('db down');
      expect(result.ticks).toBe(1);
    }
  });

  it('keeps ticking while jobs remain inflight, returns completed when they clear', async () => {
    const inflightSequence = [3, 2, 1, 0];
    const listInflight = vi.fn().mockImplementation(async () => ({
      ok: true,
      remaining: inflightSequence.shift() ?? 0,
    }));
    const { deps } = makeDeps({ listInflight });

    const result = await reconcileFirstFrames({ project_id: PROJECT_ID }, deps);

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      // Ticks until remaining hits 0 — sequence had 4 reads but exits on
      // the first read of 0. listInflight called 4 times total.
      expect(result.ticks).toBe(4);
    }
    expect(deps.poll).toHaveBeenCalledTimes(4);
    expect(listInflight).toHaveBeenCalledTimes(4);
  });

  it('returns budget_exceeded when budget elapses with jobs still pending', async () => {
    const listInflight = vi.fn().mockResolvedValue({ ok: true, remaining: 2 });
    const { deps } = makeDeps({ listInflight });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reconcileFirstFrames(
      { project_id: PROJECT_ID },
      deps,
      // Tiny budget for fast test: 100ms total, 50ms tick interval.
      { initial_delay_ms: 0, poll_interval_ms: 50, budget_ms: 100 },
    );

    expect(result.status).toBe('budget_exceeded');
    if (result.status === 'budget_exceeded') {
      expect(result.remaining_inflight).toBe(2);
      expect(result.ticks).toBeGreaterThanOrEqual(2);
    }

    warnSpy.mockRestore();
  });

  it('budget_exceeded reports -1 remaining when final listInflight also fails', async () => {
    let callIdx = 0;
    const listInflight = vi.fn().mockImplementation(async () => {
      callIdx++;
      // In-loop calls succeed; the post-loop final call (after budget cap) fails.
      // Test runs ~2 ticks → 2 in-loop calls + 1 final call.
      if (callIdx === 3) return { ok: false, error: 'late db down' };
      return { ok: true, remaining: 5 };
    });
    const { deps } = makeDeps({ listInflight });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reconcileFirstFrames({ project_id: PROJECT_ID }, deps, {
      initial_delay_ms: 0,
      poll_interval_ms: 50,
      budget_ms: 100,
    });

    expect(result.status).toBe('budget_exceeded');
    if (result.status === 'budget_exceeded') {
      expect(result.remaining_inflight).toBe(-1);
    }

    warnSpy.mockRestore();
  });

  it('respects initial_delay_ms by calling sleep once before the first poll', async () => {
    const { deps } = makeDeps();

    await reconcileFirstFrames({ project_id: PROJECT_ID }, deps, {
      initial_delay_ms: 2000,
      poll_interval_ms: 4000,
      budget_ms: 90000,
    });

    expect(deps.sleep).toHaveBeenCalledWith(2000);
    // Order check: sleep(2000) precedes the first poll call.
    const sleepMock = deps.sleep as ReturnType<typeof vi.fn>;
    const pollMock = deps.poll as ReturnType<typeof vi.fn>;
    const firstSleepOrder = sleepMock.mock.invocationCallOrder[0]!;
    const firstPollOrder = pollMock.mock.invocationCallOrder[0]!;
    expect(firstSleepOrder).toBeLessThan(firstPollOrder);
  });

  it('passes project_id through to poll and listInflight verbatim', async () => {
    const { deps } = makeDeps();
    await reconcileFirstFrames({ project_id: PROJECT_ID }, deps);

    expect(deps.poll).toHaveBeenCalledWith({ project_id: PROJECT_ID });
    expect(deps.listInflight).toHaveBeenCalledWith(PROJECT_ID);
  });
});
