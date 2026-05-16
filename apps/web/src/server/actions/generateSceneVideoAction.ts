'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { reserveMediaJob } from '@/server/lib/rate-limit';
import {
  finalizeMediaJobReservation,
  rollbackMediaJobReservation,
} from '@/server/lib/scene-helpers';
import {
  type ArcRole,
  type AudioDirection,
  type CameraMovement,
  type Character,
  type Composition,
  type Lighting,
  type SceneAssetVersion,
  type Tier,
  type VisualTheme,
  buildVideoPrompt,
  clampDurationToModel,
  getActiveVersion,
  getDefaultVideoModel,
  getVideoModelMeta,
} from '@mango/core';

// Audio mode is hardcoded to 'native' post-2026-05-13 rip-out. Every active
// video model carries native audio; the silent_tts → TTS → mux chain is gone.
// Legacy scenes with audio_mode='silent_tts' on the jsonb still serialize fine
// but the dispatcher no longer honours them — we always send native.
const RESOLVED_AUDIO_MODE = 'native' as const;
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

const InputSchema = z.object({
  project_id: z.string().uuid(),
  scene_id: z.string().min(1),
  model_override: z.string().optional(),
  prompt_override: z.string().min(1).optional(),
});

type Input = z.infer<typeof InputSchema>;

// Scene type not exported from @mango/core barrel: the barrel re-exports a minimal legacy
// Scene interface from llm/provider.ts that predates versioned assets, config_overrides,
// audio_mode, and Phase 1.4 cinematography fields. The full persisted scene type lives in
// @mango/core/llm/schemas (server-only, not barrel-safe). Local shape used here instead.
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
  // Phase 1.4.A cinematography fields (optional — older scenes may be unpopulated)
  composition?: unknown;
  camera_movement?: unknown;
  lighting?: unknown;
  audio_direction?: unknown;
  arc_role?: unknown;
};

// Script type not exported from @mango/core barrel; local minimal shape.
// The persisted script in the DB differs from ScriptGenSchema (characters[] is fully merged
// Character[], not ScriptCharacterAction[] keep/add/remove actions).
type ScriptShape = {
  scenes: SceneShape[];
  characters?: Character[];
  visual_theme?: VisualTheme | null;
  tier?: Tier | null;
};

export async function generateSceneVideoAction(
  rawInput: unknown,
): Promise<
  | { ok: true; job_id: string; existing: boolean; audio_mode: 'native' | 'silent_tts' }
  | { ok: false; error: string }
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
    .select('id, user_id, tier, script, style')
    .eq('id', input.project_id)
    .single();

  if (error || !project) return { ok: false, error: 'project not found' };
  if (project.user_id !== user.id) return { ok: false, error: 'forbidden' };

  // Cast once at the data boundary — DB returns `unknown` / `Json` for jsonb columns.
  const script = project.script as unknown as ScriptShape;
  if (!script) return { ok: false, error: 'project has no script' };

  const projectTier = (project.tier ?? 'economy') as Tier;

  const scene = script.scenes.find((s) => s.scene_id === input.scene_id);
  if (!scene) return { ok: false, error: 'scene not found' };

  // Phase 1.3.5: use the active first_frame version as continuity ref.
  const activeFrame = getActiveVersion({
    versions: scene.first_frame_versions ?? [],
    active_version_id: scene.first_frame_active_version_id ?? null,
  });
  if (!activeFrame) {
    return { ok: false, error: 'scene requires a first_frame before generating video' };
  }

  // Resolve effective tier + model (scene config_overrides win).
  const effectiveTier = scene.config_overrides?.tier ?? projectTier;
  const model =
    input.model_override ?? scene.config_overrides?.model ?? getDefaultVideoModel(effectiveTier);
  const duration_sec = clampDurationToModel(model, scene.duration_sec);

  // Audio mode is always 'native' after the 2026-05-13 audio-pipeline rip-out.
  // resolveAudioMode + silent_tts gating + ElevenLabs TTS chain are gone;
  // every active model bakes audio into the video clip directly.
  const modelMeta = getVideoModelMeta(model);
  const audioMode = RESOLVED_AUDIO_MODE;
  void modelMeta; // kept for cost-hint logging if a caller adds it back later

  // Project characters matching this scene's character_ids to slim CharacterInScene shape.
  // Stale refs (deleted characters) are silently dropped with a warning — matches house style
  // for stale refs (continuity uses 'stale' flag elsewhere; here we log and continue).
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
    } else {
      console.warn(
        `[generateSceneVideoAction] scene ${input.scene_id} references missing character_id ${id}; dropping silently`,
      );
    }
  }

  const built = buildVideoPrompt({
    model,
    scene: {
      scene_id: scene.scene_id,
      description: scene.description,
      // Normalize null → undefined to match VideoPromptSceneInput shape (string | undefined, not nullable).
      description_en: scene.description_en ?? undefined,
      duration_sec,
      dialogue: scene.dialogue,
      // Phase 1.4.A cinematography fields — undefined for older scenes; dispatcher handles absence.
      // Cast from jsonb `unknown` to schema-typed unions; runtime shape guaranteed by DB write path.
      composition: scene.composition as Composition | undefined,
      camera_movement: scene.camera_movement as CameraMovement | undefined,
      lighting: scene.lighting as Lighting | undefined,
      audio_direction: scene.audio_direction as AudioDirection | undefined,
      arc_role: scene.arc_role as ArcRole | undefined,
    },
    first_frame_storage: activeFrame.storage,
    // F73 fix: pass the RESOLVED audioMode to the dispatcher — not the raw scene.audio_mode.
    // Builders treat 'auto' the same as 'native', so passing raw 'auto' bypasses the Cyrillic→silent_tts
    // coercion that resolveAudioMode applies upstream.
    audio_mode: audioMode,
    characters_in_scene: charactersInScene,
    visual_theme: script.visual_theme ?? undefined,
    // tier precedence: script-level (visual_theme owner) > scene override > project default.
    // Differs from model selection which uses scene.config_overrides.tier ?? project.tier.
    // Intentional: script.tier governs visual_theme rendering for the whole script.
    tier: script.tier ?? effectiveTier,
  });
  const prompt = input.prompt_override ?? built.prompt;
  const { image_refs, aspect_ratio } = built;

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  // Grok Imagine Video accepts an explicit resolution; map by effective tier
  // (economy → 480p for cost, premium → 720p for quality). Ignored by other
  // engines via the FalMediaProvider branch.
  const isGrok = model.startsWith('xai/grok-imagine-video');
  const grokResolution: '480p' | '720p' = effectiveTier === 'premium' ? '720p' : '480p';

  // Atomic quota + reservation.
  const reservation = await reserveMediaJob({
    user_id: user.id,
    project_id: input.project_id,
    kind: 'video',
    scene_id: input.scene_id,
  });
  if (!reservation.ok) return { ok: false, error: reservation.error };
  if (reservation.dedup) {
    return { ok: true, job_id: reservation.job_id, existing: true, audio_mode: audioMode };
  }

  let handle: Awaited<ReturnType<typeof provider.submitSceneVideo>>;
  try {
    handle = await provider.submitSceneVideo(
      {
        prompt,
        model,
        first_frame_ref: image_refs[0]!,
        duration_sec,
        aspect_ratio,
        ...(isGrok ? { resolution: grokResolution } : {}),
      },
      ctx,
    );
  } catch (e) {
    await rollbackMediaJobReservation(reservation.job_id);
    throw e;
  }

  await finalizeMediaJobReservation({
    job_id: reservation.job_id,
    model: handle.model_used,
    fal_request_id: handle.fal_request_id,
    request_input: {
      ...(handle.request_input ?? {}),
      audio_mode: audioMode,
      first_frame_version_id: activeFrame.version_id,
    },
  });

  return { ok: true, job_id: reservation.job_id, existing: false, audio_mode: audioMode };
}
