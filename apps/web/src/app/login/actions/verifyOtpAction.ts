'use server';

import { consumePendingIntent } from '@/lib/auth/pending-intent-cookie';
import { createTopupForAuthedUser } from '@/server/lib/topup-core';
import { TopupInputSchema } from '@mango/core/billing';
import { getServerSupabase } from '@mango/db/server';
import { z } from 'zod';

// Supabase OTP length is configurable per project (default 6, can be raised to
// 8 or higher in Auth dashboard). Phase 1.6.0 hardcoded 6 → broke login the
// moment the dashboard was set to 8. Phase 1.6.1: accept any numeric token
// 4-10 digits and let Supabase be the final arbiter.
const InputSchema = z.object({
  email: z.string().email(),
  token: z.string().regex(/^\d{4,10}$/),
});

export type VerifyOtpResult =
  | { ok: true; user_id: string; next_url?: string }
  | { ok: false; error: { code: string; message: string } };

/**
 * Stable, allowlisted log fields for the post-verify replay path (Codex
 * Phase 1.8.3 SHOULD-FIX 2026-05-19 on the spec). No secrets, no full
 * cookie payload, no DB messages, no user_id/email — only the event name,
 * an error code, the intent kind, and a short hash of the project id.
 */
function shortProjectHash(projectId: string): string {
  // Cheap non-cryptographic 8-char hex from the uuid string itself. No
  // need for a real hash — we just want a stable correlation token for
  // ops without exposing the full id.
  let h = 0;
  for (let i = 0; i < projectId.length; i++) {
    h = (h * 31 + projectId.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const DEFAULT_TOPUP_PACKAGE = 'topup_2000' as const;

export async function verifyOtpAction(
  input: z.infer<typeof InputSchema>,
): Promise<VerifyOtpResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_input', message: 'Email или код некорректны.' } };
  }
  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const anonActive = Boolean(userData.user?.is_anonymous);

  const type = anonActive ? 'email_change' : 'email';
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type,
  });
  if (error || !data.user) {
    return {
      ok: false,
      error: {
        code: (error as { code?: string } | null)?.code ?? 'unknown',
        message: error?.message ?? 'Не удалось подтвердить код.',
      },
    };
  }

  // ----- Phase 1.8.3 Sub-phase D: replay pending intent if any -----
  //
  // CRITICAL DESIGN POINT (Codex rev 2 audit on the spec):
  // We pass the same `supabase` client + the just-verified `data.user`
  // DIRECTLY into createTopupForAuthedUser. We do NOT call the
  // redirecting createTopupAction wrapper — that would spawn a fresh
  // getServerSupabase() inside, whose auth.getUser() may not yet see
  // the cookies verifyOtp just set via the setAll callback (same-request
  // cookie visibility in Next 15 is unproven). The core helper sidesteps
  // the question entirely by accepting the session as a parameter.
  //
  // consumePendingIntent reads + ALWAYS clears the cookie, even if the
  // decode fails (Codex SHOULD-FIX #4 — orphan-safe).
  const pending = await consumePendingIntent();
  if (!pending) {
    return { ok: true, user_id: data.user.id };
  }
  if (!data.user.email) {
    // Defensive: verifyOtp succeeded but no email on the user record. This
    // shouldn't happen for OTP-verified users, but if it does, fall through
    // without replay rather than erroring.
    console.warn('[verifyOtp] replay skipped — no email on verified user', {
      event: 'replay_no_email',
      kind: pending.kind,
    });
    return { ok: true, user_id: data.user.id };
  }

  // Build the topup input and validate via the canonical schema. If the
  // cookie payload somehow shapes to invalid input (shouldn't — decoder
  // already Zod-validates), log + return without next_url.
  const replayInput = {
    package_code: DEFAULT_TOPUP_PACKAGE,
    intent: {
      kind: pending.kind,
      project_id: pending.project_id,
      return_to: pending.return_to,
    },
  };
  const replayParsed = TopupInputSchema.safeParse(replayInput);
  if (!replayParsed.success) {
    console.warn('[verifyOtp] replay schema invalid', {
      event: 'replay_invalid',
      kind: pending.kind,
      project_hash: shortProjectHash(pending.project_id),
    });
    return { ok: true, user_id: data.user.id };
  }

  // Codex Sub-phase C+D BLOCKER fix (2026-05-20): the topup core can
  // throw before its internal YooKassa try/catch reaches (e.g. intent
  // RPC connection drop, billing_payments lookup network error). A
  // replay failure must NEVER fail an otherwise-successful OTP login.
  // Wrap + log allowlisted fields + return ok:true without next_url.
  let result: Awaited<ReturnType<typeof createTopupForAuthedUser>>;
  try {
    result = await createTopupForAuthedUser({
      supabase,
      user: { id: data.user.id, email: data.user.email },
      input: replayParsed.data,
    });
  } catch (err) {
    console.warn('[verifyOtp] replay topup threw', {
      event: 'replay_topup_threw',
      kind: pending.kind,
      project_hash: shortProjectHash(pending.project_id),
      errName: err instanceof Error ? err.name : 'unknown',
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return { ok: true, user_id: data.user.id };
  }

  if (!result.ok) {
    // Most common reason: project ownership check failed (cookie originated
    // for a project owned by a different user — shared-device scenario).
    // Login still succeeded; we just can't proceed with the intent.
    console.warn('[verifyOtp] replay topup failed', {
      event: 'replay_topup_failed',
      code: result.error.code,
      kind: pending.kind,
      project_hash: shortProjectHash(pending.project_id),
    });
    return { ok: true, user_id: data.user.id };
  }

  return { ok: true, user_id: data.user.id, next_url: result.confirmation_url };
}
