'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  audio_mode: z.enum(['native', 'silent_tts', 'auto']),
});

type Input = z.infer<typeof InputSchema>;

type SceneShape = Record<string, unknown> & { scene_id: string };
type ScriptShape = { scenes: SceneShape[] };

export async function setSceneAudioModeAction(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  const updated: ScriptShape = {
    ...script,
    scenes: script.scenes.map((s) =>
      s.scene_id === input.scene_id ? ({ ...s, audio_mode: input.audio_mode } as SceneShape) : s,
    ),
  };

  const { error: upErr } = await sb
    .from('projects')
    .update({ script: updated as never })
    .eq('id', input.project_id);
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true };
}
