'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
});

type Input = z.infer<typeof InputSchema>;

export async function getProjectCostAction(
  rawInput: unknown,
): Promise<{ ok: true; cost_usd: number } | { ok: false; error: string }> {
  let input: Input;
  try {
    input = InputSchema.parse(rawInput);
  } catch {
    return { ok: false, error: 'invalid input' };
  }

  let user: { id: string };
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, error: 'unauthorized' };
  }

  const sb = await getServerSupabase();

  const { data, error } = await sb
    .from('media_jobs')
    .select('cost_usd')
    .eq('project_id', input.project_id)
    .eq('user_id', user.id)
    .eq('status', 'completed');

  if (error) return { ok: false, error: error.message };

  const sum = (data ?? []).reduce(
    (acc, row) => acc + (typeof row.cost_usd === 'number' ? row.cost_usd : 0),
    0,
  );
  return { ok: true, cost_usd: sum };
}
