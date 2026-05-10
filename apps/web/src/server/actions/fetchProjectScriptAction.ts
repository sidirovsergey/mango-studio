'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';

export async function fetchProjectScriptAction(input: {
  project_id: string;
}): Promise<{ ok: true; script: unknown } | { ok: false; error: string }> {
  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }
  const sb = await getServerSupabase();
  const { data, error } = await sb
    .from('projects')
    .select('script')
    .eq('id', input.project_id)
    .eq('user_id', user.id)
    .single();
  if (error || !data) return { ok: false, error: 'not found' };
  return { ok: true, script: data.script };
}
