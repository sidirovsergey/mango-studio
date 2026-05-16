'use client';

import { useStage04 } from '@/components/workspace/stages/scenes/Stage04Provider';
import { subscribeMediaJobs } from '@/lib/realtime-publication';
import { buildAllProspectivePromptsAction } from '@/server/actions/buildProspectivePromptAction';
import { fetchProjectScriptAction } from '@/server/actions/fetchProjectScriptAction';
import { pollMediaJobsAction } from '@/server/actions/pollMediaJobsAction';
import type { Database } from '@mango/db';
import { useEffect, useRef } from 'react';

type MediaJobRow = Database['public']['Tables']['media_jobs']['Row'];

const POLL_INTERVAL_MS = 5000;

const TERMINAL_STATUSES = new Set(['completed', 'error', 'cancelled', 'superseded']);

export function usePollJobs(projectId: string) {
  const { setScript, setProspectivePrompts, upsertJob, removeJob } = useStage04();
  const tickInProgress = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const refreshProspective = async () => {
      // Rebuild every scene's first_frame + video prospective prompt once the
      // script has landed. Lets SceneSidePanel render the draft inline before
      // the user clicks anything. Fire-and-forget — a failed batch leaves the
      // last-known map in place, the next tick retries.
      try {
        const r = await buildAllProspectivePromptsAction({ project_id: projectId });
        if (!cancelled && r.ok) setProspectivePrompts(r.prompts);
      } catch {
        // ignore — UI falls back to "ещё не сгенерирован" placeholder
      }
    };

    const tick = async () => {
      if (cancelled || tickInProgress.current) return;
      tickInProgress.current = true;
      try {
        const pollResult = await pollMediaJobsAction({ project_id: projectId });
        if (cancelled) return;
        if (pollResult.ok) {
          const fresh = await fetchProjectScriptAction({ project_id: projectId });
          if (cancelled) return;
          if (fresh.ok && fresh.script) {
            setScript(fresh.script as Parameters<typeof setScript>[0]);
            // Prompts depend on the just-refreshed script — rebuild now so the
            // panel updates in the same render frame as the script.
            await refreshProspective();
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
        // ⚠ Ordering matters: the realtime payload arrives the moment
        // pollMediaJobsAction writes the new version to the projects.script
        // jsonb AND marks the job 'completed'. If we remove the job *first*,
        // the UI flips lockedByGen → false before setScript lands, and the
        // scene briefly renders in its "no active version, click to generate"
        // state. The user sees that intermediate frame and reads it as
        // "generation got reverted".
        //
        // Fetch the fresh script first, push it into provider state, refresh
        // the prospective-prompts batch off the same script, and only then
        // drop the inflight job entry. The spinner stays on for the extra
        // ~200ms, but `activeFrame` / `activeVideo` flip on in the same
        // render as the spinner flips off — no flicker.
        void (async () => {
          try {
            const fresh = await fetchProjectScriptAction({ project_id: projectId });
            if (cancelled) return;
            if (fresh.ok && fresh.script) {
              setScript(fresh.script as Parameters<typeof setScript>[0]);
              await refreshProspective();
            }
          } catch {
            // network errors: removeJob still runs in the finally below,
            // and the periodic tick will reconcile.
          } finally {
            if (!cancelled) removeJob(job.id);
          }
        })();
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
  }, [projectId, setScript, setProspectivePrompts, upsertJob, removeJob]);
}
