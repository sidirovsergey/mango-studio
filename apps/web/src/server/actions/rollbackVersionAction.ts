'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import {
  type MasterClipVersion,
  type SceneAssetVersion,
  rollbackToPrevious,
  setActiveVersion,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1).optional(),
  kind: z.enum(['first_frame', 'video', 'voice_audio', 'master_clip']),
  target_version_id: z.string().min(1).optional(),
});

type Input = z.infer<typeof InputSchema>;

type SceneShape = Record<string, unknown> & { scene_id: string };
type ScriptShape = {
  scenes: SceneShape[];
  master_clip_versions?: MasterClipVersion[];
  master_clip_active_version_id?: string | null;
};

function applyRollback<V extends { version_id: string; generated_at: string }>(
  versions: V[],
  active: string | null,
  target: string | undefined,
) {
  if (target) {
    return setActiveVersion({ versions, active_version_id: active }, target);
  }
  return rollbackToPrevious({ versions, active_version_id: active });
}

export async function rollbackVersionAction(
  rawInput: unknown,
): Promise<{ ok: true; active_version_id: string | null } | { ok: false; error: string }> {
  let input: Input;
  try {
    input = InputSchema.parse(rawInput);
  } catch {
    return { ok: false, error: 'invalid input' };
  }

  if (input.kind !== 'master_clip' && !input.scene_id) {
    return { ok: false, error: 'scene_id required for non-master kinds' };
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

  let updated: ScriptShape;
  let nextActive: string | null = null;
  try {
    if (input.kind === 'master_clip') {
      const next = applyRollback(
        script.master_clip_versions ?? [],
        script.master_clip_active_version_id ?? null,
        input.target_version_id,
      );
      nextActive = next.active_version_id;
      updated = {
        ...script,
        master_clip_versions: next.versions,
        master_clip_active_version_id: next.active_version_id,
      };
    } else {
      const arrK = `${input.kind}_versions` as const;
      const actK = `${input.kind}_active_version_id` as const;
      updated = {
        ...script,
        scenes: script.scenes.map((s) => {
          if (s.scene_id !== input.scene_id) return s;
          const versions = (s[arrK] as SceneAssetVersion[] | undefined) ?? [];
          const active = (s[actK] as string | null | undefined) ?? null;
          const next = applyRollback(versions, active, input.target_version_id);
          nextActive = next.active_version_id;
          return {
            ...s,
            [arrK]: next.versions,
            [actK]: next.active_version_id,
          } as SceneShape;
        }),
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'rollback failed';
    return { ok: false, error: msg };
  }

  const { error: upErr } = await sb
    .from('projects')
    .update({ script: updated as never })
    .eq('id', input.project_id);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, active_version_id: nextActive };
}
