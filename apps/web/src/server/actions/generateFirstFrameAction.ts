'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { getMediaProvider } from '@/server/lib/media-provider-factory';
import { reserveMediaJob } from '@/server/lib/rate-limit';
import {
  finalizeMediaJobReservation,
  recordPendingJob,
  rollbackMediaJobReservation,
} from '@/server/lib/scene-helpers';
import {
  type CameraMovement,
  type Character,
  type Composition,
  type Lighting,
  type ModelTier,
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

  // prompt_override is an explicit operator override: the user is authoring the
  // prompt by hand and may intentionally exclude character refs (text-to-image
  // mode). Skip both the F53 precondition and implicit character refs.
  const useCustomPrompt = input.prompt_override !== undefined;

  // F53 hard-precondition. If ANY scene character has a dossier but no
  // reference_image, do not submit first_frame. Trigger the ref-image job
  // (idempotent — generateReferenceImageAction dedupes via pre-submit query)
  // and tell the caller to retry. Falling through to the builder is unsafe:
  // without strictness the multi-panel dossier.storage could leak into the
  // fal submission via legacy paths, and even with builder strictness the
  // resulting first-frame would render without character anchoring.
  if (!useCustomPrompt) {
    const charactersNeedingRef = characters_in_scene.filter(
      (c) => c.dossier && !c.dossier.reference_image,
    );
    if (charactersNeedingRef.length > 0) {
      const { generateReferenceImageAction } = await import('./generateReferenceImageAction');
      const names: string[] = [];
      for (const c of charactersNeedingRef) {
        await generateReferenceImageAction({
          project_id: input.project_id,
          character_id: c.id,
        });
        names.push(c.name);
      }
      return {
        ok: false,
        error: `Готовлю reference-картинки для: ${names.join(', ')}. Это ~20-30s; попробуй заново через полминуты.`,
      };
    }
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
    characters_in_scene: useCustomPrompt ? [] : characters_in_scene,
    prev_last_frame,
    project_style,
    visual_theme: script.visual_theme ?? undefined,
    first_frame_source,
  });
  const prompt = input.prompt_override ?? built.prompt;
  const image_refs = built.image_refs;

  const model = input.model_override ?? getDefaultModel(tier);

  // Atomic quota + reservation. Per-user advisory lock serializes concurrent
  // reservations so bursts can't slip past the daily cap by parallelism factor.
  const reservation = await reserveMediaJob({
    user_id: user.id,
    project_id: input.project_id,
    kind: 'first_frame',
    scene_id: input.scene_id,
  });
  if (!reservation.ok) return { ok: false, error: reservation.error };
  // dedup=true means an active OR reserved job for the same target already
  // exists; skip fal.
  if (reservation.mode === 'reserved' && reservation.dedup) {
    return { ok: true, job_id: reservation.job_id, existing: true };
  }

  const provider = getMediaProvider();
  const ctx = { user_id: user.id, project_id: input.project_id, character_id: '' };

  let handle: Awaited<ReturnType<typeof provider.submitFirstFrame>>;
  try {
    handle = await provider.submitFirstFrame(
      { prompt, model, aspect_ratio: '9:16', image_refs },
      ctx,
    );
  } catch (e) {
    if (reservation.mode === 'reserved') {
      await rollbackMediaJobReservation(reservation.job_id);
    }
    throw e;
  }

  if (reservation.mode === 'reserved') {
    // Codex blocker fix (2026-05-19): if finalize throws (DB hiccup, RLS
    // mismatch, etc.) AFTER provider.submitFirstFrame succeeded, the
    // reserved row stays at status='reserved' forever and dedupes as
    // "existing" on retry — corrupting the queue. Roll it back so the
    // next retry can re-submit cleanly. Rethrow for the outer (bulk) catch
    // to log + skip.
    try {
      await finalizeMediaJobReservation({
        job_id: reservation.job_id,
        model: handle.model_used,
        fal_request_id: handle.fal_request_id,
        request_input: handle.request_input,
      });
    } catch (e) {
      await rollbackMediaJobReservation(reservation.job_id);
      throw e;
    }
    return { ok: true, job_id: reservation.job_id, existing: false };
  }

  // Bypass mode: metering disabled or RPC degraded — fall back to the legacy
  // insert path so the job is still tracked.
  //
  // Codex blocker fix (2026-05-19): if recordPendingJob throws here, the
  // provider.submitFirstFrame above already fired and there's no reserved
  // row to roll back — we just have an UNTRACKED in-flight fal handle.
  // Identify the failure clearly so ops can find lost tracking; the outer
  // (bulk) catch logs + skips for UI resilience.
  try {
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
  } catch (e) {
    console.warn('[generateFirstFrame] record_pending_failed', {
      project_id: input.project_id,
      scene_id: input.scene_id,
      fal_request_id: handle.fal_request_id,
      errName: e instanceof Error ? e.name : 'unknown',
      errMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

const BulkInputSchema = z.object({
  project_id: z.string().uuid(),
  model_override: z.string().optional(),
});

const CAP = 5;

export async function generateAllFirstFramesAction(rawInput: unknown): Promise<
  | { ok: true; job_ids: string[]; existing_count: number; capped: boolean }
  | { ok: false; error: string }
  | {
      ok: false;
      error: 'tier_gate';
      tier_gate: {
        required_tier: import('@mango/core').AccountTier;
        kind: import('@mango/core').MediaJobKind;
        message: string;
      };
    }
  | {
      ok: false;
      error: 'insufficient_balance';
      insufficient_balance: {
        required_kopeks: number;
        current_kopeks: number;
        kind: import('@mango/core').MediaJobKind;
        model_tier: ModelTier | null;
      };
    }
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

  // Phase 1.8.x — first-frame previews are FREE (`priceKopeks('first_frame') = 0`)
  // and gated by the inner `generateFirstFrameAction` only. The scene_video
  // capability + balance reservation that this action used to do up-front
  // (Phase 1.7 «submit → render» flow) has moved into `enqueueRenderForProject`
  // (post-payment path). The workspace can also call `generateSceneVideoAction`
  // directly (e.g. SceneSidePanel «render scene» button). In both cases,
  // `generateSceneVideoAction` enforces its own scene_video tier-gate +
  // atomic `fn_reserve_balance` debit, so doing it again here would
  // double-reserve AND make the free-preview path unreachable for anon
  // trial users (balance=0).
  const allSceneIds = script.scenes.map((s) => s.scene_id);
  const total = allSceneIds.length;
  const target = allSceneIds.slice(0, CAP);

  const job_ids: string[] = [];
  let existing_count = 0;

  for (const scene_id of target) {
    let frameResult: Awaited<ReturnType<typeof generateFirstFrameAction>>;
    try {
      frameResult = await generateFirstFrameAction({
        project_id: input.project_id,
        scene_id,
        model_override: input.model_override,
        mode: 'bulk',
      });
    } catch (err) {
      // Codex Layer-1 fix (2026-05-19): inner throws used to propagate out
      // of bulk → caught by after()-block in createProjectFromIdeaAction →
      // status='error' → user saw ErrorView instead of the storyboard.
      // The inner action's own rollback (rollbackMediaJobReservation on
      // submit/finalize throw) already fired before the throw reached us,
      // so no orphan media_jobs row remains. Soft-skip the scene; the
      // storyboard renders with a placeholder thumbnail for it.
      console.warn('[generateAllFirstFrames] inner threw', {
        project_id: input.project_id,
        scene_id,
        errName: err instanceof Error ? err.name : 'unknown',
        errMessage: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!frameResult.ok) {
      // Soft errors (F53 precondition pending, reservation rate-limited,
      // invalid scene_id). Skip; batch continues.
      continue;
    }

    if (frameResult.existing) {
      existing_count++;
    }
    job_ids.push(frameResult.job_id);
  }

  return {
    ok: true,
    job_ids,
    existing_count,
    capped: total > CAP,
  };
}
