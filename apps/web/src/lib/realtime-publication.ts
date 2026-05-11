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
