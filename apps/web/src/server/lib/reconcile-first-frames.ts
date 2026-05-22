import 'server-only';

/**
 * Sync-reconcile loop for the CJM after()-flow.
 *
 * Why this exists: there is no fal webhook and the public storyboard page
 * (`/p/[publicSlug]`) does NOT poll. Without sync-reconcile in the after()
 * block of `createProjectFromIdeaAction`, the user lands on /p/{slug} after
 * status flips to `storyboard_ready` but `script.first_frame_versions` is
 * still `[]` for every scene — page renders blank columns forever.
 *
 * Strategy: tick a poll function on a fixed cadence; after each tick,
 * inspect `media_jobs` for the project. Exit when no first_frame jobs
 * remain in `pending` or `running`, or when the budget elapses.
 *
 * Returns a discriminated result so the caller can branch on outcome:
 *  - `completed` → all first_frame jobs reached terminal state; safe to flip
 *    status to `storyboard_ready`.
 *  - `budget_exceeded` → at least one first_frame job still pending past the
 *    90s budget. Caller should flip to `error` so PublicSlugPage renders the
 *    recovery storyboard view (with banner) instead of trapping the user on
 *    a forever-blank storyboard_ready page (the exact bug this fix targets —
 *    Codex SHOULD-FIX #1 audit on PR #51).
 *  - `poll_failed` → poll function returned an explicit ok:false (auth,
 *    permission). No recovery possible inside the loop. Caller flips to
 *    `error` for the same reason as `budget_exceeded`.
 *  - `query_failed` → DB read for inflight count itself failed. Same caller
 *    handling as `poll_failed`.
 *
 * Deps are injected so the helper is unit-testable in isolation without
 * mocking `next/server.after`, supabase-js, fal, or auth cookies.
 */

export type ReconcileResult =
  | { status: 'completed'; ticks: number; elapsed_ms: number }
  | { status: 'budget_exceeded'; ticks: number; elapsed_ms: number; remaining_inflight: number }
  | { status: 'poll_failed'; ticks: number; elapsed_ms: number; error: string }
  | { status: 'query_failed'; ticks: number; elapsed_ms: number; error: string };

export interface ReconcileDeps {
  /**
   * Run one poll tick. Returns ok:false to signal a non-recoverable failure
   * (auth/permission) — caller exits via `poll_failed`.
   */
  poll(args: { project_id: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Return count (or sample) of first_frame `media_jobs` still in
   * pending/running for this project.
   */
  listInflight(
    project_id: string,
  ): Promise<{ ok: true; remaining: number } | { ok: false; error: string }>;
  /** Resolve after `ms` milliseconds. Mocked in tests with a fake timer. */
  sleep(ms: number): Promise<void>;
  /** Current epoch ms. Mocked in tests with a monotonic counter. */
  now(): number;
}

export interface ReconcileConfig {
  /** Delay before the first poll tick to let fal start. Default 2000. */
  initial_delay_ms?: number;
  /** Interval between poll ticks. Default 4000. */
  poll_interval_ms?: number;
  /** Hard cap on total loop time. Default 90000. */
  budget_ms?: number;
}

/**
 * Module-level constants — exposed via override in `ReconcileConfig` for
 * tests. Production callers should not override.
 */
const DEFAULT_INITIAL_DELAY_MS = 2_000;
const DEFAULT_POLL_INTERVAL_MS = 4_000;
const DEFAULT_BUDGET_MS = 90_000;

export async function reconcileFirstFrames(
  args: { project_id: string },
  deps: ReconcileDeps,
  config: ReconcileConfig = {},
): Promise<ReconcileResult> {
  const initial_delay_ms = config.initial_delay_ms ?? DEFAULT_INITIAL_DELAY_MS;
  const poll_interval_ms = config.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS;
  const budget_ms = config.budget_ms ?? DEFAULT_BUDGET_MS;

  await deps.sleep(initial_delay_ms);

  const start = deps.now();
  let ticks = 0;

  while (deps.now() - start < budget_ms) {
    ticks++;
    let pollResult: Awaited<ReturnType<ReconcileDeps['poll']>>;
    try {
      pollResult = await deps.poll({ project_id: args.project_id });
    } catch (e) {
      // Transient tick failure (fal API blip, DB hiccup). Don't return;
      // the next tick may succeed, and the budget cap eventually exits.
      console.warn('[reconcileFirstFrames] poll threw', {
        project_id: args.project_id,
        tick: ticks,
        errMessage: e instanceof Error ? e.message : String(e),
      });
      await deps.sleep(poll_interval_ms);
      continue;
    }

    if (!pollResult.ok) {
      // Auth or permission failure — no recovery possible inside the loop.
      return {
        status: 'poll_failed',
        ticks,
        elapsed_ms: deps.now() - start,
        error: pollResult.error,
      };
    }

    const inflightResult = await deps.listInflight(args.project_id);
    if (!inflightResult.ok) {
      return {
        status: 'query_failed',
        ticks,
        elapsed_ms: deps.now() - start,
        error: inflightResult.error,
      };
    }

    if (inflightResult.remaining === 0) {
      return { status: 'completed', ticks, elapsed_ms: deps.now() - start };
    }

    await deps.sleep(poll_interval_ms);
  }

  // Budget exceeded. Caller flips to `error` so PublicSlugPage uses the
  // recovery storyboard view rather than trapping the user.
  const finalInflight = await deps.listInflight(args.project_id);
  const remaining = finalInflight.ok ? finalInflight.remaining : -1;
  return {
    status: 'budget_exceeded',
    ticks,
    elapsed_ms: deps.now() - start,
    remaining_inflight: remaining,
  };
}
