'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

type ProjectStatus = 'draft' | 'script_ready' | 'characters_ready' | 'scenes_ready' | 'final_ready';

const STATUS_ORDER: ProjectStatus[] = [
  'draft',
  'script_ready',
  'characters_ready',
  'scenes_ready',
  'final_ready',
];

const AdvanceSchema = z.object({
  project_id: z.string().uuid(),
  to: z.enum(['script_ready', 'characters_ready', 'scenes_ready', 'final_ready']),
});

export async function advanceStageAction(input: z.infer<typeof AdvanceSchema>) {
  const { project_id, to } = AdvanceSchema.parse(input);
  await getCurrentUserId();
  const supabase = await getServerSupabase();

  const { data: project, error: loadErr } = await supabase
    .from('projects')
    .select('status')
    .eq('id', project_id)
    .single();
  if (loadErr || !project) throw new Error(`advance: ${loadErr?.message ?? 'not found'}`);

  const fromIdx = STATUS_ORDER.indexOf(project.status as ProjectStatus);
  const toIdx = STATUS_ORDER.indexOf(to);
  if (toIdx !== fromIdx + 1) {
    throw new Error(`advance: invalid transition ${project.status} → ${to}`);
  }

  const { error: updErr } = await supabase
    .from('projects')
    .update({ status: to })
    .eq('id', project_id);
  if (updErr) throw new Error(`advance: ${updErr.message}`);
  revalidatePath(`/projects/${project_id}`);
}
