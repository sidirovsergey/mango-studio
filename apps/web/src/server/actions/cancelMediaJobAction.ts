'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { getServerSupabase } from '@mango/db/server';

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
  if (!['pending', 'running'].includes(job.status)) {
    return { ok: false, error: 'job is not active' };
  }

  const provider = getMediaProvider();
  await provider.cancelJob(job.fal_request_id, job.model);

  await sb.from('media_jobs').delete().eq('id', input.job_id);

  return { ok: true };
}
