import type { MediaJobUiRow } from '@/lib/pickJobUiFields';
import type { SceneView } from './ScriptStateProvider';

export type PipelinePhase =
  | { kind: 'idle' }
  | {
      kind: 'rendering';
      doneCount: number;
      totalCount: number;
      sceneStatuses: Array<'done' | 'running' | 'queued' | 'error'>;
    }
  | {
      kind: 'finalizing';
      totalCount: number;
      sceneStatuses: Array<'done' | 'running' | 'queued' | 'error'>;
    };

const INFLIGHT_STATUSES = new Set<MediaJobUiRow['status']>(['reserved', 'pending', 'running']);
const SCENE_KINDS = new Set<MediaJobUiRow['kind']>([
  'scene_first_frame',
  'first_frame',
  'video',
  'voice',
  'final_clip',
]);

type SceneStatus = 'done' | 'running' | 'queued' | 'error';

/**
 * Pick the single most relevant job from candidates targeting one scene.
 * Priority: inflight (reserved/pending/running) > error > anything else.
 * Within a bucket, newest `created_at` wins. Deterministic regardless of
 * input order — jobs[] may carry stale rows or retry sequences.
 */
export function pickBestJob(candidates: MediaJobUiRow[]): MediaJobUiRow | null {
  if (candidates.length === 0) return null;
  const score = (j: MediaJobUiRow): number =>
    INFLIGHT_STATUSES.has(j.status) ? 2 : j.status === 'error' ? 1 : 0;
  const ts = (j: MediaJobUiRow): number => (j.created_at ? new Date(j.created_at).getTime() : 0);
  return (
    candidates.slice().sort((a, b) => {
      const ds = score(b) - score(a);
      return ds !== 0 ? ds : ts(b) - ts(a);
    })[0] ?? null
  );
}

export function derivePipelinePhase(
  scenes: SceneView[],
  jobs: MediaJobUiRow[],
  masterActiveId: string | null,
): PipelinePhase {
  if (scenes.length === 0) return { kind: 'idle' };

  const sceneIds = new Set(scenes.map((s) => s.scene_id));
  const sceneScopedJobs = jobs.filter(
    (j) => j.scene_id != null && sceneIds.has(j.scene_id) && SCENE_KINDS.has(j.kind),
  );

  const masterInflight = jobs.some(
    (j) => j.kind === 'master_clip' && INFLIGHT_STATUSES.has(j.status),
  );
  const sceneInflight = sceneScopedJobs.some((j) => INFLIGHT_STATUSES.has(j.status));

  const sceneStatuses: SceneStatus[] = scenes.map((s) => {
    if (s.video_active_version_id) return 'done';
    const best = pickBestJob(sceneScopedJobs.filter((j) => j.scene_id === s.scene_id));
    if (!best) return 'queued';
    if (INFLIGHT_STATUSES.has(best.status)) return 'running';
    if (best.status === 'error') return 'error';
    return 'queued';
  });
  const doneCount = sceneStatuses.filter((s) => s === 'done').length;
  const totalCount = scenes.length;

  if (masterInflight) {
    void masterActiveId;
    return { kind: 'finalizing', totalCount, sceneStatuses };
  }
  if (sceneInflight) {
    return { kind: 'rendering', doneCount, totalCount, sceneStatuses };
  }
  return { kind: 'idle' };
}
