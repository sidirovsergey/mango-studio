import type { JobResult, MediaProvider } from '../media/provider';

export interface InflightJob {
  id: string;
  user_id: string;
  project_id: string;
  scene_id: string | null;
  character_id: string | null;
  kind:
    | 'character_dossier'
    | 'character_reference'
    | 'character_avatar'
    | 'first_frame'
    | 'video'
    | 'last_frame_extract'
    | 'voice'
    | 'final_clip'
    | 'master_clip';
  model: string;
  fal_request_id: string;
  status: 'pending' | 'running';
  request_input: Record<string, unknown>;
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
  /**
   * Fire-and-forget: download fal CDN URL → upload to Supabase Storage →
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
 * Один tick опроса всех inflight jobs для проекта.
 * Идемпотентен: повторный вызов на завершённых rows — no-op (deps.listInflight их не возвращает).
 */
export async function runPollTick(ctx: PollContext, deps: PollDeps): Promise<void> {
  const inflight = await deps.listInflight(ctx.project_id);
  for (const job of inflight) {
    const status = await deps.provider.getJobStatus(job.fal_request_id, job.model);
    if (status.status === 'completed') {
      await onComplete(job, ctx, deps);
    } else if (status.status === 'error') {
      await deps.finalizeError({ job, error_code: status.error_code ?? 'unknown' });
    }
    // pending/running — leave for next tick
  }
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
    const handle = await deps.provider.submitLastFrameExtract(
      { video_url: result.primary_url },
      {
        user_id: ctx.user_id,
        project_id: ctx.project_id,
        // AssetContext requires character_id; for scene jobs we pass '' as placeholder
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
      request_input: handle.request_input,
    });
  }
}
