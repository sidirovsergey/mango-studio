'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { type Tier, getActiveVideoModels } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  tier: z.enum(['economy', 'premium']),
});

type Input = z.infer<typeof InputSchema>;

type SceneShape = Record<string, unknown> & {
  scene_id: string;
  config_overrides?: { tier?: Tier; model?: string };
};

type ScriptShape = { scenes: SceneShape[] };

export async function setSceneTierAction(
  rawInput: unknown,
): Promise<
  { ok: true; reverted_model: string | null } | { ok: false; error: string }
> {
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
  const { data: project, error } = await sb
    .from('projects')
    .select('id, user_id, script')
    .eq('id', input.project_id)
    .maybeSingle();
  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const script = project.script as unknown as ScriptShape;
  if (!script) return { ok: false, error: 'project has no script' };

  let revertedModel: string | null = null;
  const scenes = script.scenes.map((s) => {
    if (s.scene_id !== input.scene_id) return s;
    const overrides = { ...(s.config_overrides ?? {}) };
    overrides.tier = input.tier;
    if (overrides.model && !getActiveVideoModels(input.tier).includes(overrides.model)) {
      revertedModel = overrides.model;
      delete overrides.model;
    }
    return { ...s, config_overrides: overrides } as SceneShape;
  });
  const updated = { ...script, scenes };

  const { error: upErr } = await sb
    .from('projects')
    .update({ script: updated as never })
    .eq('id', input.project_id);
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, reverted_model: revertedModel };
}
