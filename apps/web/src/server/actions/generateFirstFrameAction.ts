'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type Character,
  type PersistedScript,
  type Tier,
  buildFirstFramePrompt,
  getDefaultModel,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  model_override: z.string().optional(),
  mode: z.enum(['single', 'bulk']).default('single'),
});

type Input = z.infer<typeof InputSchema>;

type SuccessResult = { ok: true; job_id: string; existing: boolean };
type ErrorResult = { ok: false; error: string };

const styleLabel: Record<string, string> = {
  '3d_pixar': '3D Pixar',
  '2d_drawn': '2D drawn',
  clay_art: 'Clay art',
};

export async function generateFirstFrameAction(
  rawInput: unknown,
): Promise<SuccessResult | ErrorResult> {
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

  const tier = (project.tier ?? 'economy') as Tier;
  const project_style = styleLabel[project.style ?? '3d_pixar'] ?? '3D Pixar';

  // Find the target scene
  const sceneIdx = script.scenes.findIndex((s) => s.scene_id === input.scene_id);
  if (sceneIdx < 0) return { ok: false, error: 'scene not found' };
  const scene = script.scenes[sceneIdx]!;

  // Find prev scene's last_frame (only in non-bulk mode)
  const prev_last_frame =
    input.mode !== 'bulk' && sceneIdx > 0
      ? (script.scenes[sceneIdx - 1]?.last_frame?.storage ?? null)
      : null;

  // Filter characters by scene.character_ids
  const characters_in_scene = (script.characters as Character[]).filter((c) =>
    scene.character_ids.includes(c.id),
  );

  // Determine first_frame_source: bulk overrides to manual_text2img
  const first_frame_source =
    input.mode === 'bulk' ? 'manual_text2img' : (scene.first_frame_source ?? 'auto_continuity');

  const { prompt, image_refs } = buildFirstFramePrompt({
    scene: {
      scene_id: scene.scene_id,
      description: scene.description,
      composition_hint: scene.composition_hint,
    },
    characters_in_scene,
    prev_last_frame,
    project_style,
    first_frame_source,
  });

  const model = input.model_override ?? getDefaultModel(tier);

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  const handle = await provider.submitFirstFrame(
    { prompt, model, aspect_ratio: '9:16', image_refs },
    ctx,
  );

  const { job_id, existing } = await recordPendingJob({
    user_id: user.id,
    project_id: input.project_id,
    scene_id: input.scene_id,
    kind: 'first_frame',
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    request_input: handle.request_input,
  });

  return { ok: true, job_id, existing };
}

const BulkInputSchema = z.object({
  project_id: z.string().uuid(),
  model_override: z.string().optional(),
});

const CAP = 5;

export async function generateAllFirstFramesAction(
  rawInput: unknown,
): Promise<
  | { ok: true; job_ids: string[]; existing_count: number; capped: boolean }
  | { ok: false; error: string }
> {
  let input: z.infer<typeof BulkInputSchema>;
  try {
    input = BulkInputSchema.parse(rawInput);
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

  const allSceneIds = script.scenes.map((s) => s.scene_id);
  const total = allSceneIds.length;
  const target = allSceneIds.slice(0, CAP);

  const results = await Promise.all(
    target.map((scene_id) =>
      generateFirstFrameAction({
        project_id: input.project_id,
        scene_id,
        model_override: input.model_override,
        mode: 'bulk',
      }),
    ),
  );

  const successful = results.filter((r) => r.ok) as Array<{
    ok: true;
    job_id: string;
    existing: boolean;
  }>;
  const job_ids = successful.map((r) => r.job_id);
  const existing_count = successful.filter((r) => r.existing).length;

  return {
    ok: true,
    job_ids,
    existing_count,
    capped: total > CAP,
  };
}
