'use client';

import { subscribeMediaJobs } from '@/lib/realtime-publication';
import { pollMediaJobsAction } from '@/server/actions/pollMediaJobsAction';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const POLL_INTERVAL_MS = 5000;
const TERMINAL_STATUSES = new Set(['completed', 'error', 'cancelled', 'superseded']);

/**
 * Project-wide background poller. Mounts at workspace level so any stage
 * (characters / script / storyboard) sees jsonb updates from completed
 * fal jobs without needing per-stage hook wiring.
 *
 * Triggers `router.refresh()` after each successful poll tick — the RSC
 * tree re-fetches script jsonb from Supabase and re-renders.
 */
export function ProjectJobsPoller({ projectId }: { projectId: string }) {
  const router = useRouter();
  const tickInProgress = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || tickInProgress.current) return;
      tickInProgress.current = true;
      try {
        const result = await pollMediaJobsAction({ project_id: projectId });
        if (result.ok) {
          router.refresh();
        }
      } catch {
        // Network errors shouldn't crash the page; next tick retries.
      } finally {
        tickInProgress.current = false;
      }
    };

    void tick();
    const intervalId = setInterval(() => void tick(), POLL_INTERVAL_MS);

    const channel = subscribeMediaJobs(projectId, (row) => {
      const status = (row as { status?: string })?.status;
      if (status && TERMINAL_STATUSES.has(status)) {
        void tick();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      void channel.unsubscribe();
    };
  }, [projectId, router]);

  return null;
}
