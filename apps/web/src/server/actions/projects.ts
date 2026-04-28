'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const CreateProjectSchema = z.object({
  idea: z.string().min(1).max(500),
  style: z.enum(['3d_pixar', '2d_drawn', 'clay_art']),
  format: z.enum(['9:16', '16:9', '1:1']),
  target_duration_sec: z.number().int().min(15).max(90),
});

export async function createProjectAction(input: z.infer<typeof CreateProjectSchema>) {
  const data = CreateProjectSchema.parse(input);
  const userId = await getCurrentUserId();
  const supabase = await getServerSupabase();

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      idea: data.idea,
      style: data.style,
      format: data.format,
      target_duration_sec: data.target_duration_sec,
    })
    .select('id')
    .single();

  if (error || !project) throw new Error(`createProject: ${error?.message ?? 'unknown'}`);

  redirect(`/projects/${project.id}`);
}

const UpdateMetaSchema = z.object({
  project_id: z.string().uuid(),
  idea: z.string().min(1).max(500).optional(),
  style: z.enum(['3d_pixar', '2d_drawn', 'clay_art']).optional(),
  format: z.enum(['9:16', '16:9', '1:1']).optional(),
  target_duration_sec: z.number().int().min(15).max(90).optional(),
});

export async function updateProjectMetaAction(input: z.infer<typeof UpdateMetaSchema>) {
  const data = UpdateMetaSchema.parse(input);
  await getCurrentUserId();
  const supabase = await getServerSupabase();
  const { project_id, ...fields } = data;
  const { error } = await supabase.from('projects').update(fields).eq('id', project_id);
  if (error) throw new Error(`updateProjectMeta: ${error.message}`);
  revalidatePath(`/projects/${project_id}`);
}

const SetAutoModeSchema = z.object({
  project_id: z.string().uuid(),
  auto_mode: z.boolean(),
});

export async function setAutoModeAction(input: z.infer<typeof SetAutoModeSchema>) {
  const data = SetAutoModeSchema.parse(input);
  await getCurrentUserId();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ auto_mode: data.auto_mode })
    .eq('id', data.project_id);
  if (error) throw new Error(`setAutoMode: ${error.message}`);
  revalidatePath(`/projects/${data.project_id}`);
}
