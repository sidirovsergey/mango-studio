'use server';

import { getCurrentUserId } from '@/lib/auth/get-user';
import { getServerSupabase } from '@mango/db/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import { generateAllFirstFramesAction } from './generateFirstFrameAction';
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
  const sbFrom = supabase.from as unknown as (table: string) => {
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

  const sbUpdate = supabase.from as unknown as (table: string) => {
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
  after(async () => {
    try {
      await generateScriptAction({ project_id: projectId });
      // persistScript wrote 'script_ready' (legacy literal). Keep LoadingView
      // active until first_frames step completes.
      await sbUpdate('projects').update({ status: 'generating_storyboard' }).eq('id', projectId);

      // First-frame batch fires only after script is persisted (loadProjectForGeneration
      // depends on a present script). Best-effort: if a single scene's
      // first_frame fails to reserve, the bulk action returns partial; we
      // log + continue. The storyboard view tolerates missing first_frames.
      const bulkResult = await generateAllFirstFramesAction({ project_id: projectId });
      if (!bulkResult.ok) {
        console.warn('[createProjectFromIdea] first-frame batch partial/failed', {
          projectId,
          error: 'error' in bulkResult ? bulkResult.error : 'unknown',
        });
      }

      // Flip to share-ready. LoadingView poller picks this up and reloads
      // into StoryboardView. Individual scene first_frame URLs may still
      // be null at this point (fal.ai async callback pending) — the view
      // tolerates that and renders placeholders for ~30-60s until the
      // pollMediaJobsAction picks up the completions.
      await sbUpdate('projects').update({ status: 'storyboard_ready' }).eq('id', projectId);
    } catch (err) {
      console.error('[createProjectFromIdea] background gen failed', { projectId, err });
      // Flip status to 'error' so LoadingView surfaces a retry CTA.
      // Best-effort — if THIS also fails, the project stays stuck at
      // 'generating_storyboard'; cron sweep (deferred) handles those.
      await sbUpdate('projects').update({ status: 'error' }).eq('id', projectId);
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
