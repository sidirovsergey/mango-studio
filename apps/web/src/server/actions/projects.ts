'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import { reconcileCharacterPreflight } from '@/server/lib/reconcile-character-preflight';
import { reconcileFirstFrames } from '@/server/lib/reconcile-first-frames';
import type { Character } from '@mango/core';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import { generateCharacterDossierAction } from './generateCharacterDossierAction';
import { generateAllFirstFramesAction } from './generateFirstFrameAction';
import { pollMediaJobsAction } from './pollMediaJobsAction';
import { generateScriptAction } from './scripts';

const CreateProjectSchema = z.object({
  idea: z.string().min(1).max(500),
  style: z.enum(['3d_pixar', '2d_drawn', 'clay_art']),
  format: z.enum(['9:16', '16:9', '1:1']),
  target_duration_sec: z.number().int().min(15).max(90),
});

export async function createProjectAction(input: z.infer<typeof CreateProjectSchema>) {
  const data = CreateProjectSchema.parse(input);
  const userId = await getCurrentUserId();
  const supabase = await getServerSupabase();

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      idea: data.idea,
      style: data.style,
      format: data.format,
      target_duration_sec: data.target_duration_sec,
    })
    .select('id')
    .single();

  if (error || !project) throw new Error(`createProject: ${error?.message ?? 'unknown'}`);

  redirect(`/projects/${project.id}`);
}

/**
 * Phase 1.8.2 — Landing-hero entry point for the new CJM flow.
 *
 * Differs from `createProjectAction` (the legacy workspace entry):
 * - Sets `status='generating_storyboard'` immediately (vs default `draft`).
 * - Schedules background script generation + first-frame batch via
 *   `next/server.after()` so the response can redirect right away.
 * - Redirects to `/p/{public_slug}` (the new public route) NOT
 *   `/projects/{id}` (the workspace).
 *
 * Background work (after response sent):
 *   1. generateScriptAction populates `projects.script` + flips status
 *      to `script_ready` via persistScript.
 *   2. generateAllFirstFramesAction batches first_frame media_jobs for
 *      every scene in the freshly-persisted script.
 *
 * Failure handling: any throw inside `after()` → catch, flip status to
 * `error`. LoadingView on /p/{slug} detects status='error' and shows
 * a friendly retry CTA.
 *
 * Auth context: `after()` callbacks share the request scope, so the
 * inner action's `getCurrentUserId()` call sees the same cookies that
 * authenticated THIS call.
 */
const CreateFromIdeaSchema = z.object({
  idea: z.string().min(1).max(500),
  style: z.enum(['3d_pixar', '2d_drawn', 'clay_art']).default('3d_pixar'),
  format: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  target_duration_sec: z.number().int().min(15).max(90).default(40),
});

export async function createProjectFromIdeaAction(input: z.infer<typeof CreateFromIdeaSchema>) {
  const data = CreateFromIdeaSchema.parse(input);
  const userId = await getCurrentUserId();
  const supabase = await getServerSupabase();

  // INSERT with explicit status — public_slug populated by DEFAULT
  // fn_generate_public_slug() (Phase 1.8.1 migration).
  //
  // CRITICAL: `.bind(supabase)` preserves `this` inside supabase-js methods.
  // Without it, supabase-js `from()` (a regular class method) does
  // `return this.rest.from(table)` and crashes with
  // `TypeError: Cannot read properties of undefined (reading 'rest')`
  // because `this` is undefined in 'use server' strict mode when the method
  // is detached. Regression caught in prod 2026-05-19.
  const sbFrom = supabase.from.bind(supabase) as unknown as (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string; public_slug: string } | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
  };
  const { data: project, error } = await sbFrom('projects')
    .insert({
      user_id: userId,
      idea: data.idea,
      style: data.style,
      format: data.format,
      target_duration_sec: data.target_duration_sec,
      status: 'generating_storyboard',
    })
    .select('id, public_slug')
    .single();
  if (error || !project) {
    throw new Error(`createProjectFromIdea: ${error?.message ?? 'unknown'}`);
  }

  const projectId = project.id;
  const publicSlug = project.public_slug;

  const sbUpdate = supabase.from.bind(supabase) as unknown as (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };

  // Schedule background work AFTER response is sent. The user is already
  // navigating to /p/{slug} and seeing LoadingView; we don't need to await.
  //
  // Codex pre-PR audit (2026-05-19) fix #2:
  // generateScriptAction's persistScript sets status='script_ready', which
  // historically was in SHARE_READY_STATUSES → poller would reload INTO the
  // storyboard with all first_frame_url=null grey placeholders. We:
  // 1. Migration 20260519000002 removed 'script_ready' from prod (UPDATE → 'storyboard_ready').
  // 2. SHARE_READY_STATUSES no longer includes 'script_ready'.
  // 3. After generateScriptAction, we IMMEDIATELY revert status to
  //    'generating_storyboard' to keep LoadingView active until first_frames
  //    are reserved.
  // 4. After bulk first_frames complete, flip to 'storyboard_ready'.
  // Helper: update projects.status + surface DB errors. Codex SHOULD-FIX
  // (2026-05-19 diff audit): the FINAL flip to 'storyboard_ready' must
  // throw on error so the outer catch can flip to 'error' (where Layer 2
  // handles recovery). Otherwise LoadingView spins until its 6-min timeout
  // with no fallback. Intermediate flips and the catch-block's flip to
  // 'error' stay best-effort.
  const updateStatus = async (
    status: string,
    opts: { throwOnError?: boolean } = {},
  ): Promise<void> => {
    const { error: updateErr } = await sbUpdate('projects').update({ status }).eq('id', projectId);
    if (updateErr) {
      console.error('[createProjectFromIdea] status update failed', {
        projectId,
        target_status: status,
        errMessage: updateErr.message,
      });
      if (opts.throwOnError) {
        throw new Error(
          `[createProjectFromIdea] updateStatus(${status}) failed: ${updateErr.message}`,
        );
      }
    }
  };

  after(async () => {
    try {
      await generateScriptAction({ project_id: projectId });
      // persistScript wrote 'script_ready' (legacy literal). Keep LoadingView
      // active until first_frames step completes.
      await updateStatus('generating_storyboard');

      // Character preflight — generate dossier + reference_image for every
      // character BEFORE bulk first_frames. Without this, the first_frame
      // submits go to fal with empty `image_refs` and nano-banana renders
      // visually-different versions of "the same" character per scene
      // (root cause of user's 2026-05-22 "разный персонаж в каждой сцене"
      // report). Uses `skipReferenceRecovery: false` so the F53 chain in
      // pollMediaJobsAction.finalizeCompleted auto-fires reference_image
      // after each dossier completes. On budget_exceeded: log and proceed
      // — partial consistency is better than a stuck flow (per Codex
      // round-2 audit Q3 answer).
      const preflightResult = await reconcileCharacterPreflight(
        { project_id: projectId },
        {
          readCharacters: async (project_id) => {
            const sbRead = supabase.from.bind(supabase) as unknown as (table: string) => {
              select: (cols: string) => {
                eq: (
                  col: string,
                  val: string,
                ) => {
                  single: () => Promise<{
                    data: { script: { characters?: Character[] } | null } | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
            const { data, error: readErr } = await sbRead('projects')
              .select('script')
              .eq('id', project_id)
              .single();
            if (readErr || !data) return { ok: false, error: readErr?.message ?? 'not found' };
            const characters = (data.script?.characters ?? []).filter((c) => !c.archived);
            return { ok: true, characters };
          },
          submitDossier: (args) => generateCharacterDossierAction(args),
          poll: (args) => pollMediaJobsAction(args),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now: () => Date.now(),
        },
      );

      if (preflightResult.status === 'completed') {
        console.info('[createProjectFromIdea] preflight complete', {
          projectId,
          ticks: preflightResult.ticks,
          elapsed_ms: preflightResult.elapsed_ms,
          submitted: preflightResult.submitted_character_ids.length,
          ready: preflightResult.ready_count,
        });
      } else if (preflightResult.status === 'no_op') {
        console.info('[createProjectFromIdea] preflight no_op', {
          projectId,
          reason: preflightResult.reason,
        });
      } else {
        // budget_exceeded / poll_failed / script_unavailable — proceed
        // anyway. Bulk first_frames will run without image_refs for the
        // affected characters; their scenes will be visually inconsistent
        // but the storyboard still ships.
        console.warn('[createProjectFromIdea] preflight non-terminal, proceeding anyway', {
          projectId,
          ...preflightResult,
        });
      }

      // First-frame batch fires only after script is persisted (loadProjectForGeneration
      // depends on a present script). Post Codex 2026-05-19 Layer-1 fix, the
      // bulk action catches all inner throws internally; we only see
      // {ok:false} for hard structural cases (project missing, etc.).
      const bulkResult = await generateAllFirstFramesAction({ project_id: projectId });
      if (!bulkResult.ok) {
        console.warn('[createProjectFromIdea] first-frame batch returned ok:false', {
          projectId,
          error: 'error' in bulkResult ? bulkResult.error : 'unknown',
        });
      }

      // Resilience: retry the bulk action once. reserveMediaJob dedupes on
      // (project_id, scene_id, kind) when an active row already exists, so
      // successfully-submitted scenes become a no-op (existing_count++). Only
      // scenes that hit a transient submit failure on the first pass get a
      // fresh fal call. Observed in prod 2026-05-22 (Дельфин/3KUtmj0UJ5):
      // bulk submitted only 1 of 4 scenes; cause unclear but a second pass
      // recovers without operator action.
      const bulkRetry = await generateAllFirstFramesAction({ project_id: projectId });
      if (!bulkRetry.ok) {
        console.warn('[createProjectFromIdea] first-frame batch retry returned ok:false', {
          projectId,
          error: 'error' in bulkRetry ? bulkRetry.error : 'unknown',
        });
      }

      // Sync-reconcile fal results into script.first_frame_versions BEFORE
      // flipping to share-ready. Without this, /p/{slug} renders with empty
      // thumbnails forever: there's no fal webhook and the public page has no
      // poller (pollMediaJobsAction is auth-gated for the workspace flow).
      // We're still inside the request context (page.tsx maxDuration=300), so
      // getCurrentUser() inside pollMediaJobsAction sees the same cookies.
      const reconcileResult = await reconcileFirstFrames(
        { project_id: projectId },
        {
          poll: (args) =>
            pollMediaJobsAction({ project_id: args.project_id, skipReferenceRecovery: true }),
          listInflight: async (project_id) => {
            const sbInflight = supabase.from.bind(supabase) as unknown as (table: string) => {
              select: (
                cols: string,
                opts: { count: 'exact'; head: true },
              ) => {
                eq: (
                  col: string,
                  val: string,
                ) => {
                  eq: (
                    col: string,
                    val: string,
                  ) => {
                    in: (
                      col: string,
                      vals: string[],
                    ) => Promise<{
                      count: number | null;
                      error: { message: string } | null;
                    }>;
                  };
                };
              };
            };
            const { count, error: queryErr } = await sbInflight('media_jobs')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', project_id)
              .eq('kind', 'first_frame')
              .in('status', ['pending', 'running']);
            if (queryErr) return { ok: false, error: queryErr.message };
            return { ok: true, remaining: count ?? 0 };
          },
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now: () => Date.now(),
        },
      );

      if (reconcileResult.status === 'completed') {
        console.info('[createProjectFromIdea] reconcile complete', {
          projectId,
          ticks: reconcileResult.ticks,
          elapsed_ms: reconcileResult.elapsed_ms,
        });
        await updateStatus('storyboard_ready', { throwOnError: true });
      } else {
        // budget_exceeded / poll_failed / query_failed → flip to `error`.
        // PublicSlugPage detects status='error' and renders the recovery
        // storyboard view (with banner) so the user sees the script + any
        // completed thumbnails instead of being trapped on a forever-blank
        // `storyboard_ready` page (Codex SHOULD-FIX #1 on PR #51).
        console.warn('[createProjectFromIdea] reconcile non-terminal', {
          projectId,
          ...reconcileResult,
        });
        await updateStatus('error');
      }
    } catch (err) {
      console.error('[createProjectFromIdea] background gen failed', { projectId, err });
      // Flip status to 'error'. With Phase 1.8.x recovery, page.tsx falls
      // back to PublicStoryboardView (with banner) if the script
      // generated before the throw — only truly catastrophic (no script)
      // failures render ErrorView.
      await updateStatus('error');
    }
  });

  redirect(`/p/${publicSlug}`);
}

const UpdateMetaSchema = z.object({
  project_id: z.string().uuid(),
  style: z.enum(['3d_pixar', '2d_drawn', 'clay_art']).optional(),
  format: z.enum(['9:16', '16:9', '1:1']).optional(),
  target_duration_sec: z.number().int().min(15).max(90).optional(),
});

export async function updateProjectMetaAction(input: z.infer<typeof UpdateMetaSchema>) {
  const data = UpdateMetaSchema.parse(input);
  await getCurrentUserId();
  const supabase = await getServerSupabase();
  const { project_id, ...fields } = data;
  const { error } = await supabase.from('projects').update(fields).eq('id', project_id);
  if (error) throw new Error(`updateProjectMeta: ${error.message}`);
  revalidatePath(`/projects/${project_id}`);
}

const UpdateIdeaSchema = z.object({
  project_id: z.string().uuid(),
  idea: z.string().min(1).max(500),
});

export async function updateIdeaAction(input: z.infer<typeof UpdateIdeaSchema>) {
  const data = UpdateIdeaSchema.parse(input);
  await getCurrentUserId();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ idea: data.idea })
    .eq('id', data.project_id);
  if (error) throw new Error(`updateIdea: ${error.message}`);
  revalidatePath(`/projects/${data.project_id}`);
}

const SetAutoModeSchema = z.object({
  project_id: z.string().uuid(),
  auto_mode: z.boolean(),
});

export async function setAutoModeAction(input: z.infer<typeof SetAutoModeSchema>) {
  const data = SetAutoModeSchema.parse(input);
  await getCurrentUserId();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ auto_mode: data.auto_mode })
    .eq('id', data.project_id);
  if (error) throw new Error(`setAutoMode: ${error.message}`);
  revalidatePath(`/projects/${data.project_id}`);
}
