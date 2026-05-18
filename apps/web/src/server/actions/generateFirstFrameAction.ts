'use server';

import { getCurrentUser } from '@/lib/auth/get-user';
import { assertCapabilityOrLog } from '@/server/lib/assert-capability-or-log';
import { getAccountTier } from '@/server/lib/get-account-tier';
import { getBalance } from '@/server/lib/get-balance';
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
  TierGateError,
  type VisualTheme,
  buildFirstFramePrompt,
  getDefaultModel,
  priceKopeks,
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
    await finalizeMediaJobReservation({
      job_id: reservation.job_id,
      model: handle.model_used,
      fal_request_id: handle.fal_request_id,
      request_input: handle.request_input,
    });
    return { ok: true, job_id: reservation.job_id, existing: false };
  }

  // Bypass mode: metering disabled or RPC degraded — fall back to the legacy
  // insert path so the job is still tracked.
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

  // Account-tier capability gate (Phase 1.6 D2).
  // Single first-frame is an image kind (open to all tiers). Bulk path
  // fans out to scene_video chains, so check the scene_video capability instead.
  // projectTier ('economy' | 'premium') is passed as modelTier so assertCapability
  // can distinguish free+economy (allowed) vs free+premium (blocked).
  const projectTier = (project.tier ?? 'economy') as Tier;
  try {
    const accountTier = await getAccountTier(sb, user.id);
    assertCapabilityOrLog(accountTier, 'scene_video', projectTier);
  } catch (err) {
    if (err instanceof TierGateError) {
      return {
        ok: false,
        error: 'tier_gate',
        tier_gate: {
          required_tier: err.required_tier,
          kind: err.kind,
          message: err.message,
        },
      } as const;
    }
    throw err;
  }

  const allSceneIds = script.scenes.map((s) => s.scene_id);
  const total = allSceneIds.length;
  const target = allSceneIds.slice(0, CAP);

  // Phase 1.7 — Balance pre-flight (cheap UX gate before any fan-out).
  // first_frame images are free (priceKopeks('first_frame') = 0), but each
  // bulk first-frame kicks off a scene_video chain, so pre-reserve the video
  // balance for all scenes up-front.
  const balance = await getBalance(sb, user.id);
  const priceKop = priceKopeks('scene_video', projectTier as ModelTier);
  const requiredKop = priceKop * target.length;
  if (requiredKop > 0 && balance < requiredKop) {
    return {
      ok: false,
      error: 'insufficient_balance',
      insufficient_balance: {
        required_kopeks: requiredKop,
        current_kopeks: balance,
        kind: 'scene_video',
        model_tier: (projectTier as ModelTier) ?? null,
      },
    } as const;
  }

  // Phase 1.7 — Sequential fan-out with per-scene atomic balance reservation.
  // Converted from Promise.all to sequential for-loop so mid-loop drain can
  // cancel and refund all prior reserved jobs (triggers fn_refund_reservation).
  const reserveBalanceRpc = sb.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  const submittedJobIds: string[] = [];
  const job_ids: string[] = [];
  let existing_count = 0;

  for (const scene_id of target) {
    const frameResult = await generateFirstFrameAction({
      project_id: input.project_id,
      scene_id,
      model_override: input.model_override,
      mode: 'bulk',
    });

    if (!frameResult.ok) {
      // Non-balance error (e.g. tier_gate from inner action, F53 precondition, etc.).
      // Skip this scene but continue — partial fan-out is acceptable for non-balance errors.
      continue;
    }

    if (frameResult.existing) {
      // Dedup: job already exists, no new balance reservation needed.
      job_ids.push(frameResult.job_id);
      existing_count++;
      continue;
    }

    // New first_frame job reserved — now atomically reserve scene_video balance
    // linked to the first_frame media_job row.
    if (priceKop > 0) {
      const reserved = await reserveBalanceRpc('fn_reserve_balance', {
        p_job_id: frameResult.job_id,
        p_user_id: user.id,
        p_kopeks: priceKop,
        p_kind: 'scene_video',
        p_model_tier: (projectTier as ModelTier) ?? null,
      });
      if (reserved.error || reserved.data === false) {
        // Cancel the just-reserved first_frame job.
        await sb.from('media_jobs').update({ status: 'canceled' }).eq('id', frameResult.job_id);
        // Cancel all prior first_frame jobs in this batch — triggers fn_refund_reservation
        // on each, restoring the reserved scene_video balance for each prior scene.
        for (const priorJobId of submittedJobIds) {
          await sb.from('media_jobs').update({ status: 'canceled' }).eq('id', priorJobId);
        }
        return {
          ok: false,
          error: 'insufficient_balance',
          insufficient_balance: {
            required_kopeks: priceKop,
            current_kopeks: balance - submittedJobIds.length * priceKop,
            kind: 'scene_video',
            model_tier: (projectTier as ModelTier) ?? null,
          },
        } as const;
      }
      // Successfully reserved — track for potential later rollback in this batch.
      submittedJobIds.push(frameResult.job_id);
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
