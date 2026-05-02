'use client';

import { fetchProjectScriptAction } from '@/server/actions/fetchProjectScriptAction';
import { pollMediaJobsAction } from '@/server/actions/pollMediaJobsAction';
import { subscribeMediaJobs } from '@/lib/realtime-publication';
import type { Database } from '@mango/db';
import { useEffect, useRef } from 'react';
import { useStage04 } from './Stage04Provider';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

const POLL_INTERVAL_MS = 5000;

const TERMINAL_STATUSES = new Set(['completed', 'error', 'cancelled', 'superseded']);

export function usePollJobs(projectId: string) {
  const { setScript, upsertJob, removeJob } = useStage04();
  const tickInProgress = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || tickInProgress.current) return;
      tickInProgress.current = true;
      try {
        const pollResult = await pollMediaJobsAction({ project_id: projectId });
        if (pollResult.ok) {
          const fresh = await fetchProjectScriptAction({ project_id: projectId });
          if (fresh.ok && fresh.script) {
            setScript(fresh.script as Parameters<typeof setScript>[0]);
          }
        }
      } catch {
        // swallow — network errors shouldn't crash the page
      } finally {
        tickInProgress.current = false;
      }
    };

    // Reconcile on mount
    void tick();

    // 5-second polling interval
    const intervalId = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    // Realtime subscription for instant push updates
    const channel = subscribeMediaJobs(projectId, (row) => {
      const job = row as unknown as MediaJobRow;
      if (!job?.id) return;

      if (TERMINAL_STATUSES.has(job.status)) {
        // Terminal jobs: remove from active list, then do a tick to refresh script
        removeJob(job.id);
        void tick();
      } else {
        // pending / running: upsert into active list
        upsertJob(job);
      }
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      void channel.unsubscribe();
    };
  }, [projectId, setScript, upsertJob, removeJob]);
}
