import type { Database } from '@mango/db';

type FullMediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

/**
 * Narrow projection of a media_jobs row for client-side UI state.
 *
 * Internal fields (request_input, fal_request_id, model, result_storage,
 * cost_usd, latency_ms, user_id) stay on the server. This type mirrors the
 * SELECT column list in `app/projects/[id]/page.tsx` and the realtime
 * callback narrowing in `use-poll-jobs.ts`.
 *
 * If a new column becomes UI-relevant, add it here AND to the SQL projection
 * AND keep `pickJobUiFields` aligned — in the same commit.
 */
export type MediaJobUiRow = Pick<
  FullMediaJobRow,
  | 'id'
  | 'project_id'
  | 'scene_id'
  | 'character_id'
  | 'kind'
  | 'status'
  | 'error_code'
  | 'created_at'
  | 'updated_at'
  | 'retry_count'
  | 'delayed_until'
>;

/**
 * Project the realtime payload (which carries the full row) to the narrow
 * client-state shape. Used by the use-poll-jobs realtime callback before
 * `upsertJob`.
 */
export function pickJobUiFields(row: FullMediaJobRow): MediaJobUiRow {
  return {
    id: row.id,
    project_id: row.project_id,
    scene_id: row.scene_id,
    character_id: row.character_id,
    kind: row.kind,
    status: row.status,
    error_code: row.error_code,
    created_at: row.created_at,
    updated_at: row.updated_at,
    retry_count: row.retry_count,
    delayed_until: row.delayed_until,
  };
}
