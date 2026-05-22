'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { getServerSupabase } from '@mango/db/server';

/**
 * Cancel an active media job.
 *
 * Accepts `status` in `('reserved', 'pending', 'running')`:
 * - `reserved` — fal was never called (placeholder `fal_request_id='reserved:UUID'`
 *   written by `reserve_media_job` RPC). Skip provider.cancelJob; just flip
 *   status. UI started showing ✕ on reserved rows after PR #53 widened the
 *   inflight set; this action follows suit.
 * - `pending`/`running` — fal is processing. Tell the provider to stop.
 *
 * # Refund safety (Codex BLOCKER #2 on PR #53 post-merge audit)
 *
 * Previously this action did `DELETE FROM media_jobs`. But `billing_charges`
 * has `media_job_id REFERENCES media_jobs(id) ON DELETE CASCADE` — deleting
 * wiped the charge row without `fn_refund_reservation` ever firing → user's
 * balance was debited but never credited back. Switched to `UPDATE
 * status='cancelled'` which is a terminal transition that fires the
 * `tg_billing_settle_on_terminal` trigger → `fn_refund_reservation` →
 * balance refunded. Pairs with migration `20260522000003` which fixes the
 * trigger to actually recognise 'cancelled' (British) instead of the
 * `'canceled'` (American) it used to check for.
 */
export async function cancelMediaJobAction(input: { job_id: string }): Promise<
  { ok: true } | { ok: false; error: string }
> {
  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

  const sb = await getServerSupabase();

  const { data: job, error } = await sb
    .from('media_jobs')
    .select('id, user_id, fal_request_id, model, status')
    .eq('id', input.job_id)
    .single();
  if (error || !job) return { ok: false, error: 'job not found' };
  if (job.user_id !== user.id) return { ok: false, error: 'forbidden' };
  if (!['reserved', 'pending', 'running'].includes(job.status)) {
    return { ok: false, error: 'job is not active' };
  }

  // Reserved rows carry a placeholder fal_request_id ('reserved:UUID') — fal
  // never received the job, so there's nothing to cancel provider-side.
  // Only pending/running have a real fal request to abort.
  if (job.status !== 'reserved') {
    const provider = getMediaProvider();
    try {
      await provider.cancelJob(job.fal_request_id, job.model);
    } catch (e) {
      // Provider cancel is best-effort: the user wants the row marked cancelled
      // and the balance refunded regardless. Worst case fal still ships the
      // result; pollMediaJobsAction would then ignore it because the job row
      // is in a terminal status.
      console.warn('[cancelMediaJob] provider cancel threw, proceeding to status flip', {
        job_id: input.job_id,
        fal_request_id: job.fal_request_id,
        model: job.model,
        errMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const { error: updateErr } = await sb
    .from('media_jobs')
    .update({ status: 'cancelled' })
    .eq('id', input.job_id);
  if (updateErr) {
    return { ok: false, error: `cancel failed: ${updateErr.message}` };
  }

  return { ok: true };
}
