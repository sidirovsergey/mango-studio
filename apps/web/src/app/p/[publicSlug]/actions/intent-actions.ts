'use server';

import { createTopupAction } from '@/app/upgrade/actions/createTopupAction';
import { setPendingIntent } from '@/lib/auth/pending-intent-cookie';
import { getServerSupabase } from '@mango/db/server';

/**
 * Phase 1.8.1 / 1.8.3 — sticky-CTA action wrappers.
 *
 * Both actions delegate to v1.7.1 createTopupAction with a binding intent.
 * For MVP we use the smallest topup package (`topup_2000`) for both render
 * and studio entries. Aggregate render price for a typical 6-scene economy
 * project is ~310 ₽ — well below 2000 ₽ — so the user has buffer balance
 * left over for regens / extra renders.
 *
 * Phase 1.8.3 addition: anon users get their intent preserved in an
 * HMAC-signed httpOnly cookie BEFORE the action reports auth_required. The
 * client navigates to /login on receiving the auth_required code; after
 * OTP verify, verifyOtpAction reads the cookie and replays the intent
 * directly via createTopupForAuthedUser (skipping the redirecting wrapper).
 *
 * Future (1.8.4+): smart package selection — if aggregate_render_price > 2000 ₽
 * pick the next package up. For now keep dumb default; cheap to fix later.
 */

const DEFAULT_TOPUP_PACKAGE = 'topup_2000' as const;

export type IntentKind = 'render' | 'studio';

export type IntentActionResult =
  | { ok: true; confirmation_url: string; payment_id: string; nonce?: string }
  | { ok: false; error: { code: string; message: string } };

/**
 * Returns true if the caller is anonymous (or has no email). Side-effect:
 * writes the pending-intent cookie so verifyOtpAction can replay after
 * the /login detour. Caller MUST short-circuit with `auth_required` when
 * this returns true — the cookie is already armed.
 */
async function detectAnonAndSetCookie(args: {
  kind: IntentKind;
  projectId: string;
  publicSlug: string;
}): Promise<boolean> {
  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || user.is_anonymous || !user.email) {
    // Codex Sub-phase C+D SHOULD-FIX (2026-05-20): setPendingIntent
    // throws fail-loud if PENDING_INTENT_SECRET is missing/weak (Sub-
    // phase A contract). At the action boundary we want to degrade
    // gracefully: log the config failure and still surface auth_required
    // so the user hits /login. The detour intent is lost but the user
    // isn't bricked at the CTA.
    try {
      await setPendingIntent({
        kind: args.kind,
        project_id: args.projectId,
        return_to: `/p/${args.publicSlug}`,
      });
    } catch (err) {
      console.error('[intent-actions] setPendingIntent threw — env misconfig?', {
        event: 'set_pending_intent_threw',
        kind: args.kind,
        errName: err instanceof Error ? err.name : 'unknown',
        errMessage: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }
  return false;
}

const AUTH_REQUIRED: IntentActionResult = {
  ok: false,
  error: {
    code: 'auth_required',
    message: 'Войдите, чтобы продолжить — мы сохраним выбор.',
  },
};

export async function requestRenderAction(input: {
  projectId: string;
  publicSlug: string;
}): Promise<IntentActionResult> {
  if (
    await detectAnonAndSetCookie({
      kind: 'render',
      projectId: input.projectId,
      publicSlug: input.publicSlug,
    })
  ) {
    return AUTH_REQUIRED;
  }
  return createTopupAction({
    package_code: DEFAULT_TOPUP_PACKAGE,
    intent: {
      kind: 'render',
      project_id: input.projectId,
      return_to: `/p/${input.publicSlug}`,
    },
  });
}

export async function openProStudioAction(input: {
  projectId: string;
  publicSlug: string;
}): Promise<IntentActionResult> {
  if (
    await detectAnonAndSetCookie({
      kind: 'studio',
      projectId: input.projectId,
      publicSlug: input.publicSlug,
    })
  ) {
    return AUTH_REQUIRED;
  }
  return createTopupAction({
    package_code: DEFAULT_TOPUP_PACKAGE,
    intent: {
      kind: 'studio',
      project_id: input.projectId,
      return_to: `/p/${input.publicSlug}`,
    },
  });
}
