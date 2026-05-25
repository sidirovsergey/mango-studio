'use client';

import { createBrowserClient } from './supabase-browser';

/**
 * Subscribe to media_jobs INSERT/UPDATE/DELETE events for a project.
 * RLS already filters by user_id on the server. Returns the channel so callers
 * can `.unsubscribe()` on cleanup.
 *
 * Each call gets a UNIQUE channel name (with a random suffix) so that multiple
 * components on the same page (e.g. ProjectJobsPoller + Stage04Inline's
 * usePollJobs) can subscribe independently. Without the suffix, Supabase JS
 * returns the same channel reference for the second caller; calling `.on()`
 * after that channel's already-issued `subscribe()` throws
 * "cannot add `postgres_changes` callbacks ... after `subscribe()`".
 *
 * Usage in a client component:
 *   const ch = subscribeMediaJobs(project_id, (job) => updateLocalState(job));
 *   return () => { ch.unsubscribe(); };
 *
 * ⚠ KNOWN LEAK — TO BE FIXED IN A FOLLOW-UP PR
 * Supabase Realtime's postgres_changes delivers the FULL row over the WS
 * frame. Internal columns (request_input, fal_request_id, model,
 * result_storage, cost_usd, latency_ms, metadata) are visible in browser
 * DevTools → Network → WS even though the JS state in ScriptStateProvider
 * is narrowed via pickJobUiFields. RLS ensures this is a SAME-USER leak
 * only (no cross-user exposure), so callers see their own internal data,
 * not anyone else's. Still, the spec §6 claim that internal fields stay
 * server-side is not fully honored on the realtime path.
 *
 * Fix paths considered for the follow-up PR:
 *   (a) Sanitized broadcast: server-side trigger publishes to a Supabase
 *       Realtime Broadcast channel with only UI fields.
 *   (b) Sanitized event table: a `media_job_ui_events` table populated by
 *       trigger from media_jobs, containing only the MediaJobUiRow columns,
 *       with its own RLS + replication.
 *   (c) Drop the payload entirely: realtime fires as a "something changed"
 *       ping, the client responds by re-fetching the narrow projection via
 *       pollMediaJobsAction (already exists). Loses ~50ms latency.
 * See Codex audit dated 2026-05-25 on PR #56 for the original finding.
 */
export function subscribeMediaJobs(
  project_id: string,
  onChange: (job: Record<string, unknown>) => void,
) {
  const sb = createBrowserClient();
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  const channel = sb
    .channel(`media_jobs:${project_id}:${suffix}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'media_jobs',
        filter: `project_id=eq.${project_id}`,
      },
      (payload) => {
        const row = payload.new ?? payload.old;
        if (row) onChange(row as Record<string, unknown>);
      },
    )
    .subscribe();
  return channel;
}
