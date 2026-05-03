'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { type Scene, type Tier, isVideoModelInTier } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  model: z.string().min(1),
});

type SceneWithOverrides = Scene & {
  config_overrides?: { model?: string; duration_sec?: number };
};

export async function setSceneModelAction(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  if (!isVideoModelInTier(input.model, tier)) {
    return { ok: false, error: `model ${input.model} is not available in tier ${tier}` };
  }

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
  const updated: SceneWithOverrides = {
    ...scene,
    config_overrides: { ...(scene.config_overrides ?? {}), model: input.model },
  };

  const scenes = [...script.scenes];
  scenes[idx] = updated;

  const { error: updateErr } = await sb
    .from('projects')
    .update({ script: { ...script, scenes } as never })
    .eq('id', input.project_id);

  if (updateErr) return { ok: false, error: 'update failed' };

  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true };
}
