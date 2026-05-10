'use client';

import { createBrowserClient } from './supabase-browser';

/**
 * Subscribe to media_jobs INSERT/UPDATE/DELETE events for a project.
 * RLS already filters by user_id on the server. Returns the channel so callers
 * can `.unsubscribe()` on cleanup.
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
  const channel = sb
    .channel(`media_jobs:${project_id}`)
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
