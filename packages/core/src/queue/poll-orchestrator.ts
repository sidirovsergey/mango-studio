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

export interface PollDeps {
  listInflight(project_id: string): Promise<InflightJob[]>;
  finalizeCompleted(args: {
    job: InflightJob;
    result_storage: unknown;
    cost_usd: number | null;
    latency_ms: number;
  }): Promise<void>;
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
  provider: Pick<
    MediaProvider,
    'getJobStatus' | 'getJobResult' | 'submitLastFrameExtract'
  >;
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

async function onComplete(
  job: InflightJob,
  ctx: PollContext,
  deps: PollDeps,
): Promise<void> {
  const result: JobResult = await deps.provider.getJobResult(job.fal_request_id, job.model);
  const persisted = await deps.persistAsset(result.primary_url, {
    user_id: ctx.user_id,
    project_id: ctx.project_id,
  });
  await deps.finalizeCompleted({
    job,
    result_storage: persisted,
    cost_usd: result.cost_usd,
    latency_ms: result.latency_ms,
  });

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
