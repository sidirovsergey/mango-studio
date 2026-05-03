'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { type Scene, type Tier, clampDurationToModel, getDefaultVideoModel } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  duration_sec: z.number().int().min(1).max(60),
});

type SceneWithOverrides = Scene & {
  config_overrides?: { model?: string; duration_sec?: number };
};

export async function setSceneDurationAction(
  rawInput: unknown,
): Promise<{ ok: true; clamped_to: number } | { ok: false; error: string }> {
  let input: z.infer<typeof InputSchema>;
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

  const { data: project, error } = await sb
    .from('projects')
    .select('id, user_id, tier, script')
    .eq('id', input.project_id)
    .single();

  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const tier = (project.tier ?? 'economy') as Tier;

  const script = project.script as unknown as {
    title: string;
    scenes: SceneWithOverrides[];
    characters: unknown[];
    master_clip: unknown;
  } | null;
  if (!script) return { ok: false, error: 'project has no script' };

  const idx = script.scenes.findIndex((s) => s.scene_id === input.scene_id);
  if (idx === -1) return { ok: false, error: 'scene not found' };

  const scene = script.scenes[idx]!;

  const effectiveModel =
    (scene as SceneWithOverrides).config_overrides?.model ?? getDefaultVideoModel(tier);

  const clamped = clampDurationToModel(effectiveModel, input.duration_sec);

  const updated: SceneWithOverrides = { ...scene, duration_sec: clamped };
  const scenes = [...script.scenes];
  scenes[idx] = updated;

  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: { ...script, scenes } as never })
    .eq('id', input.project_id);

  if (updateErr) return { ok: false, error: 'update failed' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true, clamped_to: clamped };
}
