import type { JobResult, MediaProvider } from '../media/provider';
import type { MediaJobKind } from '../quota/tiers';

const MINUTE_MS = 60_000;
const DEFAULT_STALE_THRESHOLD_MS = 5 * MINUTE_MS;
const POLL_UNRECOVERABLE_AFTER_ERRORS = 5;

export const DEFAULT_STALE_THRESHOLD_MS_BY_KIND: Partial<Record<MediaJobKind, number>> = {
  character_dossier: 3 * MINUTE_MS,
  video: 10 * MINUTE_MS,
  scene_video: 10 * MINUTE_MS,
};

export interface InflightJob {
  id: string;
  user_id: string;
  project_id: string;
  scene_id: string | null;
  character_id: string | null;
  kind: MediaJobKind;
  model: string;
  fal_request_id: string;
  status: 'pending' | 'running';
  request_input: Record<string, unknown>;
  created_at?: string | null;
  poll_count?: number;
  last_polled_at?: string | null;
  poll_error_count?: number;
  last_poll_error_at?: string | null;
  /** Phase 1.4.1 - number of times the underlying op has been retried (cap=1). */
  retry_count?: number;
}

/**
 * Hint returned by `finalizeCompleted` to drive the async storage-mirror pipeline
 * (Phase 1.3.5+). Pre-Sub-phase-C callers may return `void`, in which case the
 * orchestrator skips mirror/deleteStorage side-effects.
 */
export interface MirrorHint {
  project_id: string;
  scene_id?: string; // omitted for master_clip
  version_id: string;
  kind: 'first_frame' | 'video' | 'voice_audio' | 'master_clip';
  ext: string;
  /** Supabase Storage path of the version evicted by appendVersion overflow, if any. */
  dropped_supabase_path?: string;
}

export interface PollDeps {
  listInflight(project_id: string): Promise<InflightJob[]>;
  finalizeCompleted(args: {
    job: InflightJob;
    result_storage: unknown;
    cost_usd: number | null;
    latency_ms: number;
  }): Promise<MirrorHint | undefined>;
  finalizeError(args: { job: InflightJob; error_code: string }): Promise<void>;
  recordPollAttempt?(args: {
    job: InflightJob;
    status: 'pending' | 'running';
    polled_at: string;
  }): Promise<void>;
  recordPollError?(args: {
    job: InflightJob;
    poll_error_count: number;
    last_poll_error_at: string;
    error_message: string;
    error_name: string;
    error_stack: string | null;
  }): Promise<void>;
  markPollUnrecoverable?(args: {
    job: InflightJob;
    poll_error_count: number;
    last_poll_error_at: string;
    error_message: string;
    error_name: string;
    error_stack: string | null;
  }): Promise<void>;
  recordPendingJob(args: {
    user_id: string;
    project_id: string;
    scene_id?: string;
    character_id?: string;
    kind: string;
    model: string;
    fal_request_id: string;
    request_input: Record<string, unknown>;
  }): Promise<{ job_id: string; existing: boolean }>;
  persistAsset(url: string, ctx: { user_id: string; project_id: string }): Promise<unknown>;
  provider: Pick<MediaProvider, 'getJobStatus' | 'getJobResult' | 'submitLastFrameExtract'>;
  staleThresholdMsByKind?: Partial<Record<MediaJobKind, number>>;
  now?: () => Date;
  warn?: (message: string, meta: Record<string, unknown>) => void;
  /**
   * Fire-and-forget: download fal CDN URL -> upload to Supabase Storage ->
   * update jsonb storage descriptor. Failures are silently retried by Phase 1.4 cron.
   */
  mirror?: (args: {
    project_id: string;
    scene_id?: string;
    version_id: string;
    kind: 'first_frame' | 'video' | 'voice_audio' | 'master_clip';
    ext: string;
  }) => Promise<{ ok: boolean }>;
  /**
   * Fire-and-forget: best-effort delete an evicted version's Supabase Storage object.
   * Only called when a dropped version actually had `storage.kind === 'supabase'`.
   */
  deleteStorage?: (path: string) => Promise<void>;
}

export interface PollContext {
  project_id: string;
  user_id: string;
}

/**
 * One polling tick for all inflight jobs in a project.
 * Idempotent: completed rows are not returned by `deps.listInflight`.
 */
export async function runPollTick(ctx: PollContext, deps: PollDeps): Promise<void> {
  const inflight = await deps.listInflight(ctx.project_id);
  for (const job of inflight) {
    try {
      await pollOneJob(job, ctx, deps);
    } catch (err) {
      const warn = deps.warn ?? console.warn;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorName =
        err instanceof Error ? (err.constructor?.name ?? err.name ?? 'Error') : 'unknown';
      const errorStack = err instanceof Error && typeof err.stack === 'string' ? err.stack : null;
      warn('[poll-orchestrator] job poll failed', {
        job_id: job.id,
        project_id: job.project_id,
        kind: job.kind,
        fal_request_id: job.fal_request_id,
        error: errorMessage,
        error_name: errorName,
      });
      await recordPollFailure(
        job,
        { errorMessage, errorName, errorStack },
        deps,
        warn,
      );
    }
  }
}

async function pollOneJob(job: InflightJob, ctx: PollContext, deps: PollDeps): Promise<void> {
  const status = await deps.provider.getJobStatus(job.fal_request_id, job.model);
  if (status.status === 'completed') {
    await onComplete(job, ctx, deps);
  } else if (status.status === 'error') {
    await deps.finalizeError({ job, error_code: status.error_code ?? 'unknown' });
  } else {
    const polledAt = deps.now?.() ?? new Date();
    try {
      await deps.recordPollAttempt?.({
        job,
        status: status.status,
        polled_at: polledAt.toISOString(),
      });
    } catch (err) {
      const warn = deps.warn ?? console.warn;
      warn('[poll-orchestrator] heartbeat write failed; continuing to stale eval', {
        job_id: job.id,
        project_id: job.project_id,
        kind: job.kind,
        fal_request_id: job.fal_request_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (
      job.status === 'pending' &&
      status.status === 'pending' &&
      isStuckInQueue(job, polledAt, deps)
    ) {
      await deps.finalizeError({ job, error_code: 'stuck_in_queue' });
    }
  }
  // pending/running: leave for next tick unless stale detection marked it terminal.
}

async function recordPollFailure(
  job: InflightJob,
  errorMeta: { errorMessage: string; errorName: string; errorStack: string | null },
  deps: PollDeps,
  warn: (message: string, meta: Record<string, unknown>) => void,
): Promise<void> {
  const lastPollErrorAt = (deps.now?.() ?? new Date()).toISOString();
  const nextPollErrorCount = (job.poll_error_count ?? 0) + 1;
  try {
    if (nextPollErrorCount >= POLL_UNRECOVERABLE_AFTER_ERRORS) {
      if (deps.markPollUnrecoverable) {
        await deps.markPollUnrecoverable({
          job,
          poll_error_count: nextPollErrorCount,
          last_poll_error_at: lastPollErrorAt,
          error_message: errorMeta.errorMessage,
          error_name: errorMeta.errorName,
          error_stack: errorMeta.errorStack,
        });
      } else {
        await deps.finalizeError({ job, error_code: 'poll_unrecoverable' });
      }
      return;
    }

    await deps.recordPollError?.({
      job,
      poll_error_count: nextPollErrorCount,
      last_poll_error_at: lastPollErrorAt,
      error_message: errorMeta.errorMessage,
      error_name: errorMeta.errorName,
      error_stack: errorMeta.errorStack,
    });
  } catch (err) {
    warn('[poll-orchestrator] poll failure bookkeeping failed', {
      job_id: job.id,
      project_id: job.project_id,
      kind: job.kind,
      fal_request_id: job.fal_request_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function isStuckInQueue(job: InflightJob, now: Date, deps: PollDeps): boolean {
  if (!job.created_at) return false;
  const createdAtMs = Date.parse(job.created_at);
  if (Number.isNaN(createdAtMs)) return false;
  const threshold =
    deps.staleThresholdMsByKind?.[job.kind] ??
    DEFAULT_STALE_THRESHOLD_MS_BY_KIND[job.kind] ??
    DEFAULT_STALE_THRESHOLD_MS;
  return now.getTime() - createdAtMs > threshold;
}

async function onComplete(job: InflightJob, ctx: PollContext, deps: PollDeps): Promise<void> {
  const result: JobResult = await deps.provider.getJobResult(job.fal_request_id, job.model);
  const persisted = await deps.persistAsset(result.primary_url, {
    user_id: ctx.user_id,
    project_id: ctx.project_id,
  });
  const hint = await deps.finalizeCompleted({
    job,
    result_storage: persisted,
    cost_usd: result.cost_usd,
    latency_ms: result.latency_ms,
  });

  // Phase 1.3.5: fire-and-forget storage mirror + drop cleanup.
  // Pre-Sub-phase-C callers return void here, so the block is a no-op until
  // finalizeCompleted is migrated to use appendVersion and emit a MirrorHint.
  if (hint && deps.mirror) {
    void deps.mirror({
      project_id: hint.project_id,
      scene_id: hint.scene_id,
      version_id: hint.version_id,
      kind: hint.kind,
      ext: hint.ext,
    });
    if (hint.dropped_supabase_path && deps.deleteStorage) {
      void deps.deleteStorage(hint.dropped_supabase_path);
    }
  }

  // Side-effect for video kind: when fal didn't return last_frame_url,
  // submit a separate extract job so continuity ref is available for next scene.
  if (job.kind === 'video' && !result.last_frame_url && job.scene_id) {
    const videoVersionId = hint?.kind === 'video' ? hint.version_id : undefined;
    const handle = await deps.provider.submitLastFrameExtract(
      { video_url: result.primary_url },
      {
        user_id: ctx.user_id,
        project_id: ctx.project_id,
        // AssetContext requires character_id; for scene jobs we pass '' as placeholder.
        character_id: '',
      },
    );
    await deps.recordPendingJob({
      user_id: ctx.user_id,
      project_id: ctx.project_id,
      scene_id: job.scene_id,
      kind: 'last_frame_extract',
      model: handle.model_used,
      fal_request_id: handle.fal_request_id,
      request_input: {
        ...handle.request_input,
        ...(videoVersionId ? { video_version_id: videoVersionId } : {}),
      },
    });
  }
}
