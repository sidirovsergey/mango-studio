'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { applyAssetToScript } from '@/server/lib/scene-helpers';
import type { PersistedScript, SceneAsset, SceneVideoAsset, ScriptGenOutput } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  kind: z.enum(['first_frame', 'video']),
  file: z.instanceof(File),
});

type Input = z.infer<typeof InputSchema>;

export async function uploadSceneAssetAction(
  rawInput: unknown,
): Promise<{ ok: true; storage_path: string } | { ok: false; error: string }> {
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
    .select('id, user_id, tier, script, style')
    .eq('id', input.project_id)
    .single();

  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const script = project.script as unknown as PersistedScript;
  if (!script) return { ok: false, error: 'project has no script' };

  // Build storage path
  const rawExt = input.file.name.split('.').pop();
  const ext = rawExt ?? (input.kind === 'video' ? 'mp4' : 'png');
  const path = `${user.id}/${input.project_id}/${input.scene_id}/${input.kind}-${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage
    .from('scene-assets')
    .upload(path, input.file, { contentType: input.file.type, upsert: true });

  if (uploadError) return { ok: false, error: `upload failed: ${uploadError.message}` };

  const generated_at = new Date().toISOString();
  const storage = { kind: 'supabase' as const, path };

  let asset: SceneAsset | SceneVideoAsset;
  if (input.kind === 'first_frame') {
    asset = {
      storage,
      model: 'user_upload',
      generated_at,
      source: 'user_upload',
    } satisfies SceneAsset;
  } else {
    asset = {
      storage,
      model: 'user_upload',
      generated_at,
      fal_request_id: '',
      duration_sec: 8,
      source: 'user_upload',
      has_native_audio: false,
    } satisfies SceneVideoAsset;
  }

  // Apply asset to script (returns a fresh copy).
  // PersistedScript.characters is Character[] (post-merge), but applyAssetToScript
  // only touches scenes — cast through unknown to satisfy the type.
  let updatedScript = applyAssetToScript(script as unknown as ScriptGenOutput, {
    scene_id: input.scene_id,
    kind: input.kind,
    asset,
  });

  // For first_frame, also set scene.first_frame_source = 'user_upload'
  if (input.kind === 'first_frame') {
    const sceneIdx = updatedScript.scenes.findIndex((s) => s.scene_id === input.scene_id);
    if (sceneIdx >= 0) {
      const updatedScenes = [...updatedScript.scenes];
      updatedScenes[sceneIdx] = {
        ...updatedScenes[sceneIdx]!,
        first_frame_source: 'user_upload',
      };
      updatedScript = { ...updatedScript, scenes: updatedScenes };
    }
  }

  const { error: updateError } = await sb
    .from('projects')
    .update({
      script: updatedScript as never,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.project_id)
    .eq('user_id', user.id);

  if (updateError) return { ok: false, error: 'script update failed' };

  return { ok: true, storage_path: path };
}
