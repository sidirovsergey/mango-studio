import 'server-only';

import { generateMasterClipAction } from '@/server/actions/generateMasterClipAction';
import { generateSceneVideoAction } from '@/server/actions/generateSceneVideoAction';
import { getServerSupabase, getServiceRoleSupabase } from '@mango/db/server';

/**
 * Phase 1.7.1 — enqueue render orchestrator.
 *
 * Idempotency: safe to call multiple times on the same project. The chain
 * generateSceneVideoAction → reserveMediaJob is dedup-aware (returns
 * `existing: true` if a media_jobs row already exists for the (user,
 * project, scene) tuple, no new row created, no double balance debit).
 * Same for generateMasterClipAction. Codex audit F2 #4: a user refresh
 * mid-partial-failure does NOT double-reserve already-reserved scenes;
 * only the failed scenes get retried.
 *
 * Called from `/p/[slug]?nonce=X` after `fn_inspect_intent` reports
 * intent_status='paid' and payment_status='succeeded'. Iterates the
 * project's scenes, fires generateSceneVideoAction for each, then
 * generateMasterClipAction, then flips the intent to 'consumed' via
 * service role.
 *
 * NOT called from the ЮKassa webhook directly:
 * - Webhook runs as an anon (no-cookies) client and lacks the
 *   authenticated session that generateSceneVideoAction needs (it goes
 *   through getCurrentUser → auth.uid()).
 * - Webhook must return 200 inside ~15s (ЮKassa retry policy); a 5-scene
 *   render submission with serial fal.ai calls easily exceeds that.
 *
 * Architectural trade-off (vs Codex 2026-05-18 "webhook should enqueue"
 * recommendation): if the user closes the tab between payment and return,
 * the balance is still credited (fn_apply_topup ran), the intent stays
 * at 'paid' (audit trail intact), but the render does not auto-fire.
 * User can manually trigger from Stage 04 with the credited balance.
 * False-negative is bounded to "balance available, not auto-rendered" —
 * acceptable for v1.7.1 MVP; future enhancement (Edge runtime cron OR
 * Vercel `after()` background task) can close it without changing the
 * intent ledger contract.
 */

export interface EnqueueRenderResult {
  ok: boolean;
  scene_job_ids: string[];
  master_job_id?: string;
  scene_errors: Array<{ scene_id: string; error: string }>;
  master_error?: string;
  intent_consumed: boolean;
}

type ProjectRow = { user_id: string; script: { scenes: Array<{ scene_id: string }> } | null };

export async function enqueueRenderForProject(opts: {
  intent_id: string;
  project_id: string;
}): Promise<EnqueueRenderResult> {
  const sb = await getServerSupabase();

  // generated DB types don't include the new intent_id column on billing_payments
  // (and don't include projects.script in a fully-typed way); narrow locally.
  const { data, error } = await (
    sb.from.bind(sb) as unknown as (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => {
          single: () => Promise<{ data: ProjectRow | null; error: unknown }>;
        };
      };
    }
  )('projects')
    .select('user_id, script')
    .eq('id', opts.project_id)
    .single();

  if (error || !data) {
    return {
      ok: false,
      scene_job_ids: [],
      scene_errors: [],
      master_error: 'project_not_found',
      intent_consumed: false,
    };
  }

  const script = data.script;
  if (!script || !Array.isArray(script.scenes) || script.scenes.length === 0) {
    return {
      ok: false,
      scene_job_ids: [],
      scene_errors: [],
      master_error: 'project_has_no_scenes',
      intent_consumed: false,
    };
  }

  const scene_job_ids: string[] = [];
  const scene_errors: Array<{ scene_id: string; error: string }> = [];

  // Serial submission: each call already includes atomic media-job + balance
  // reservation; running in parallel would only complicate failure ordering.
  // Scenes are typically 4-8 per project; total wall time ~5-15s for fal.ai
  // submit handles. Page that called this should show a streaming progress UI.
  for (const s of script.scenes) {
    const r = await generateSceneVideoAction({
      project_id: opts.project_id,
      scene_id: s.scene_id,
    });
    if (r.ok) {
      scene_job_ids.push(r.job_id);
    } else {
      scene_errors.push({
        scene_id: s.scene_id,
        error: 'error' in r && typeof r.error === 'string' ? r.error : 'unknown',
      });
    }
  }

  let master_job_id: string | undefined;
  let master_error: string | undefined;

  // Only attempt master_clip if all scenes successfully reserved. A partial
  // failure leaves intent='paid' so the user can manually re-trigger after
  // resolving the failed scenes (e.g. top-up more balance).
  if (scene_errors.length === 0) {
    const mr = await generateMasterClipAction({ project_id: opts.project_id });
    if (mr.ok) {
      master_job_id = mr.job_id;
    } else {
      master_error = 'error' in mr && typeof mr.error === 'string' ? mr.error : 'unknown';
    }
  } else {
    master_error = 'skipped_due_to_scene_errors';
  }

  const allOk = scene_errors.length === 0 && !master_error;

  // Flip intent to 'consumed' ONLY when everything is reserved. Partial
  // success leaves the intent in 'paid' state, allowing manual retry from
  // the project page.
  let intent_consumed = false;
  if (allOk) {
    const svc = getServiceRoleSupabase();
    const svcRpc = svc.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { code?: string; message: string } | null }>;
    const { error: markErr } = await svcRpc('fn_mark_intent_consumed', {
      p_intent_id: opts.intent_id,
    });
    if (markErr) {
      // Non-fatal: jobs are already enqueued, balance debited. The intent
      // staying at 'paid' is wrong but recoverable — operator can manually
      // flip it via SQL with audit trail. Log loudly.
      console.error('[enqueueRenderForProject] fn_mark_intent_consumed failed', {
        intent_id: opts.intent_id,
        error: markErr,
      });
    } else {
      intent_consumed = true;
    }
  }

  return {
    ok: allOk,
    scene_job_ids,
    master_job_id,
    scene_errors,
    master_error,
    intent_consumed,
  };
}
