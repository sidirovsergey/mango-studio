'use server';

/**
 * Prospective prompt builder — gives the user the *exact* prompt that would
 * be sent to fal at the next click of "create frame" / "create video",
 * before any version exists. Lets them edit it in the PromptEditorModal
 * preflight rather than waiting for the first version to land just to see
 * what the engine was told.
 *
 * Implementation: re-uses the same builders that generateFirstFrameAction
 * and generateSceneVideoAction call, so what the user sees here is byte-for-
 * byte what the generator will send (modulo their final edit). Mirroring the
 * production code path is intentional — drift between this preview and the
 * real generator's prompt would be a worse UX than no preview at all.
 *
 * Video prompts in the prospective path need a first_frame placeholder
 * because the prompt builders expect a StoredAsset for `first_frame_storage`.
 * We pass a fal_passthrough sentinel pointing at the `@Image1` marker the
 * prompt itself already references; this only affects `image_refs` (unused
 * for text preview) and the [Subject] block's "reference: @Image1" suffix,
 * which stays correct.
 */

import { getCurrentUser } from '@/lib/auth/get-user';
import {
  type ArcRole,
  type AudioDirection,
  type CameraMovement,
  type Character,
  type Composition,
  type Lighting,
  type SceneAssetVersion,
  type StoredAsset,
  type Style,
  type Tier,
  type VisualTheme,
  buildFirstFramePrompt,
  buildVideoPrompt,
  clampDurationToModel,
  getActiveVersion,
  getDefaultVideoModel,
  getVideoModelMeta,
  resolveAudioMode,
} from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  kind: z.enum(['first_frame', 'video']),
});

type SceneShape = {
  scene_id: string;
  description: string;
  description_en?: string | null;
  duration_sec: number;
  dialogue: { speaker: string; text: string } | null;
  character_ids: string[];
  first_frame_source?: 'auto_continuity' | 'manual_text2img' | 'user_upload';
  audio_mode?: 'native' | 'silent_tts' | 'auto';
  first_frame_versions?: SceneAssetVersion[];
  first_frame_active_version_id?: string | null;
  config_overrides?: { tier?: Tier; model?: string };
  last_frame?: { storage: StoredAsset } | null;
  composition?: unknown;
  camera_movement?: unknown;
  lighting?: unknown;
  audio_direction?: unknown;
  arc_role?: unknown;
};

type ScriptShape = {
  scenes: SceneShape[];
  characters?: Character[];
  visual_theme?: VisualTheme | null;
  tier?: Tier | null;
};

type SuccessResult = { ok: true; prompt: string; model: string };
type ErrorResult = { ok: false; error: string };

const FIRST_FRAME_PLACEHOLDER: StoredAsset = {
  kind: 'fal_passthrough',
  url: '@Image1',
};

export async function buildProspectivePromptAction(
  rawInput: unknown,
): Promise<SuccessResult | ErrorResult> {
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
    .select('user_id, tier, script, style')
    .eq('id', input.project_id)
    .single();
  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  const script = project.script as unknown as ScriptShape | null;
  if (!script) return { ok: false, error: 'project has no script' };

  const projectTier = (project.tier ?? 'economy') as Tier;
  const projectStyle = (project.style ?? '3d_pixar') as Style;

  const sceneIdx = script.scenes.findIndex((s) => s.scene_id === input.scene_id);
  if (sceneIdx < 0) return { ok: false, error: 'scene not found' };
  const scene = script.scenes[sceneIdx]!;

  // -- FIRST FRAME branch ----------------------------------------------------
  if (input.kind === 'first_frame') {
    const prevScene = sceneIdx > 0 ? script.scenes[sceneIdx - 1] : null;
    const prev_last_frame = prevScene?.last_frame?.storage ?? null;

    const characters_in_scene = (script.characters ?? []).filter((c) =>
      scene.character_ids.includes(c.id),
    );

    const first_frame_source = scene.first_frame_source ?? 'auto_continuity';

    const built = buildFirstFramePrompt({
      scene: {
        scene_id: scene.scene_id,
        description: scene.description,
        description_en: scene.description_en ?? undefined,
        composition: (scene.composition as Composition | undefined) ?? undefined,
        camera_movement: (scene.camera_movement as CameraMovement | undefined) ?? undefined,
        lighting: (scene.lighting as Lighting | undefined) ?? undefined,
      },
      characters_in_scene,
      prev_last_frame,
      project_style: projectStyle,
      visual_theme: script.visual_theme ?? undefined,
      first_frame_source,
    });

    // Model isn't strictly part of the prompt but lets the modal surface
    // "what will run". Mirror generateFirstFrameAction's selection.
    const { getDefaultModel } = await import('@mango/core');
    const model = getDefaultModel(projectTier);

    return { ok: true, prompt: built.prompt, model };
  }

  // -- VIDEO branch ----------------------------------------------------------
  const effectiveTier = scene.config_overrides?.tier ?? projectTier;
  const model = scene.config_overrides?.model ?? getDefaultVideoModel(effectiveTier);
  const duration_sec = clampDurationToModel(model, scene.duration_sec);
  const modelMeta = getVideoModelMeta(model);

  const audioMode = resolveAudioMode(
    { audio_mode: scene.audio_mode ?? 'auto', dialogue: scene.dialogue },
    { has_native_audio: modelMeta?.has_native_audio ?? false },
  );

  // Use the active first_frame if it exists; otherwise the sentinel placeholder.
  // The latter only affects image_refs (unused for text preview) and the
  // [Subject] block's "@Image1" suffix, which stays semantically correct.
  const activeFrame = getActiveVersion({
    versions: scene.first_frame_versions ?? [],
    active_version_id: scene.first_frame_active_version_id ?? null,
  });
  const first_frame_storage: StoredAsset = activeFrame?.storage ?? FIRST_FRAME_PLACEHOLDER;

  const scriptCharacters = script.characters ?? [];
  const charactersInScene: {
    id: string;
    name: string;
    description: string;
    full_prompt?: string;
  }[] = [];
  for (const id of scene.character_ids ?? []) {
    const char = scriptCharacters.find((c) => c.id === id);
    if (char) {
      charactersInScene.push({
        id: char.id,
        name: char.name,
        description: char.description ?? '',
        full_prompt: char.full_prompt,
      });
    }
  }

  const built = buildVideoPrompt({
    model,
    scene: {
      scene_id: scene.scene_id,
      description: scene.description,
      description_en: scene.description_en ?? undefined,
      duration_sec,
      dialogue: scene.dialogue,
      composition: scene.composition as Composition | undefined,
      camera_movement: scene.camera_movement as CameraMovement | undefined,
      lighting: scene.lighting as Lighting | undefined,
      audio_direction: scene.audio_direction as AudioDirection | undefined,
      arc_role: scene.arc_role as ArcRole | undefined,
    },
    first_frame_storage,
    audio_mode: audioMode,
    characters_in_scene: charactersInScene,
    visual_theme: script.visual_theme ?? undefined,
    tier: script.tier ?? effectiveTier,
  });

  return { ok: true, prompt: built.prompt, model };
}
