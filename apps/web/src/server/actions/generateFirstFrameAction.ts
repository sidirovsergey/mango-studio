'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { recordPendingJob } from '@/server/lib/scene-helpers';
import {
  type CameraMovement,
  type Character,
  type Composition,
  type Lighting,
  type Style,
  type Tier,
  type VisualTheme,
  buildFirstFramePrompt,
  getDefaultModel,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  model_override: z.string().optional(),
  prompt_override: z.string().min(1).optional(),
  mode: z.enum(['single', 'bulk']).default('single'),
});

type Input = z.infer<typeof InputSchema>;

type SuccessResult = { ok: true; job_id: string; existing: boolean };
type ErrorResult = { ok: false; error: string };

// Scene type not exported from @mango/core barrel: the barrel re-exports a minimal legacy
// Scene interface from llm/provider.ts that predates versioned assets and Phase 1.4
// cinematography fields. Local shape used here instead.
type SceneShape = {
  scene_id: string;
  description: string;
  description_en?: string | null;
  duration_sec: number;
  dialogue: { speaker: string; text: string } | null;
  character_ids: string[];
  first_frame_source?: 'auto_continuity' | 'manual_text2img' | 'user_upload';
  // Versioned assets
  last_frame?: { storage: { kind: string; url?: string; path?: string } } | null;
  // Phase 1.4.A cinematography fields (optional — older scenes may be unpopulated)
  composition?: unknown;
  camera_movement?: unknown;
  lighting?: unknown;
};

// Script type not exported from @mango/core barrel; local minimal shape.
type ScriptShape = {
  scenes: SceneShape[];
  characters?: Character[];
  visual_theme?: VisualTheme | null;
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

  // Cast once at the data boundary — DB returns `unknown` / `Json` for jsonb columns.
  const script = project.script as unknown as ScriptShape;
  if (!script) return { ok: false, error: 'project has no script' };

  const tier = (project.tier ?? 'economy') as Tier;
  const project_style = (project.style ?? '3d_pixar') as Style;

  // Find the target scene
  const sceneIdx = script.scenes.findIndex((s) => s.scene_id === input.scene_id);
  if (sceneIdx < 0) return { ok: false, error: 'scene not found' };
  const scene = script.scenes[sceneIdx]!;

  // Find prev scene's last_frame (only in non-bulk mode)
  const prevScene = input.mode !== 'bulk' && sceneIdx > 0 ? script.scenes[sceneIdx - 1] : null;
  const prev_last_frame = prevScene?.last_frame?.storage
    ? (prevScene.last_frame.storage as unknown as import('@mango/core').StoredAsset)
    : null;

  // Filter characters by scene.character_ids
  const characters_in_scene = (script.characters ?? []).filter((c) =>
    scene.character_ids.includes(c.id),
  );

  // Continuity backfill — characters created before the 1.4 migration landed in
  // Supabase had their dossier → reference_image auto-chain silently aborted
  // (`character_reference_image` kind was rejected by the old CHECK constraint).
  // These characters now have `dossier.storage` (multi-pose model sheet) but
  // NO `dossier.reference_image` (the single-pose 1:1 anchor first_frame
  // actually needs). The buildFirstFramePrompt fallback feeds the multi-pose
  // sheet to nano-banana, which then renders an entirely different character —
  // exactly the "different person every scene" symptom the user reports.
  //
  // For every character in this scene that has a dossier but no
  // reference_image, kick off the reference_image job and tell the caller to
  // retry once it lands. Idempotent: generateReferenceImageAction returns
  // 'already_exists' if the chain has since completed.
  const charactersNeedingRef = characters_in_scene.filter(
    (c) => c.dossier && !c.dossier.reference_image,
  );
  if (charactersNeedingRef.length > 0) {
    const { generateReferenceImageAction } = await import('./generateReferenceImageAction');
    const triggered: string[] = [];
    for (const c of charactersNeedingRef) {
      const r = await generateReferenceImageAction({
        project_id: input.project_id,
        character_id: c.id,
      });
      if (r.ok && r.status === 'pending') triggered.push(c.name);
    }
    if (triggered.length > 0) {
      return {
        ok: false,
        error: `Сначала допилю reference-картинки для: ${triggered.join(', ')}. Это займёт ~20-30s; попробуй заново через полминуты.`,
      };
    }
    // If nothing triggered (all already_exists or failed individually), fall through
    // and let the prompt builder do its best — the fallback warning will still log.
  }

  // Determine first_frame_source: bulk overrides to manual_text2img
  const first_frame_source =
    input.mode === 'bulk' ? 'manual_text2img' : (scene.first_frame_source ?? 'auto_continuity');

  const built = buildFirstFramePrompt({
    scene: {
      scene_id: scene.scene_id,
      description: scene.description,
      description_en: scene.description_en ?? undefined,
      // Phase 1.4.A structured cinematography fields (cast from unknown jsonb)
      composition: (scene.composition as Composition | undefined) ?? undefined,
      camera_movement: (scene.camera_movement as CameraMovement | undefined) ?? undefined,
      lighting: (scene.lighting as Lighting | undefined) ?? undefined,
    },
    characters_in_scene,
    prev_last_frame,
    project_style,
    visual_theme: script.visual_theme ?? undefined,
    first_frame_source,
  });
  const prompt = input.prompt_override ?? built.prompt;
  const image_refs = built.image_refs;

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

  const script = project.script as unknown as ScriptShape;
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
