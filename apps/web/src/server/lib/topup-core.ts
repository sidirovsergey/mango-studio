import 'server-only';

import { randomBytes } from 'node:crypto';

import { createYooKassaPayment } from '@/server/lib/yookassa-client';
import { TOPUP_PACKAGE_KOPEKS, type TopupInput } from '@mango/core/billing';
import type { getServerSupabase } from '@mango/db/server';

/**
 * Phase 1.8.3 Sub-phase B — non-redirecting top-up core.
 *
 * Background: Phase 1.7.1 `createTopupAction` redirected anon users to
 * /login via `redirect()`. Phase 1.8.3 wants `verifyOtpAction` to REPLAY
 * the user's pending intent right after OTP verify so they land directly
 * on the ЮKassa confirmation URL — but `verifyOtpAction` cannot accept
 * a nested `redirect('/login')` thrown back up at it. Codex rev 2 audit
 * verdict: extract the post-auth path into a parametric helper that
 * accepts `supabase` + `user` and never redirects.
 *
 * This module is that helper. `createTopupAction` (the legacy /upgrade
 * caller) now uses it after its OWN auth check + redirect; `verifyOtpAction`
 * uses it directly with the supabase client returned by `verifyOtp`.
 *
 * Single responsibility: take an authed session, produce a ЮKassa payment +
 * billing_payments row + optional billing_intents binding, return the
 * confirmation URL. No auth check inside — that's the caller's job.
 */

export type AuthedUser = { id: string; email: string };
export type SupabaseClient = Awaited<ReturnType<typeof getServerSupabase>>;

export type CreateTopupResult =
  | { ok: true; confirmation_url: string; payment_id: string; nonce?: string }
  | { ok: false; error: { code: string; message: string } };

// Local minimal typings — `supabase gen types` lag means billing_*
// columns aren't in the generated Database union yet. The casts here are
// the only place this pattern lives; callers receive a clean
// CreateTopupResult.
type SbInsert = (
  row: Record<string, unknown>,
) => Promise<{ error: { code?: string; message: string } | null }>;
type SbSelectOne = {
  select: (cols: string) => {
    eq: (
      col: string,
      val: string,
    ) => {
      single: () => Promise<{
        data: Record<string, unknown> | null;
        error: { code?: string; message: string } | null;
      }>;
    };
  };
};
type SbFrom = (table: string) => SbSelectOne & { insert: SbInsert };
type SbRpc<TRow> = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: TRow | null; error: { code?: string; message: string } | null }>;

type IntentRow = {
  intent_id: string;
  out_nonce: string;
  out_billing_payment_id: string | null;
  is_new: boolean;
};

/**
 * 16-char base64url nonce ≈ 95.27 bits of entropy. Bearer-style token
 * surfaced in `/p/{slug}?nonce=X` post-payment; RLS on billing_intents
 * enforces user_id match, so a stolen nonce cannot be redeemed by another
 * user.
 */
function generateNonce(): string {
  return randomBytes(12).toString('base64url').slice(0, 16);
}

/**
 * Process a parsed top-up input for an already-authenticated user. Never
 * redirects; returns a structured result. Pass in the SAME `supabase`
 * client the caller is currently using (e.g. the one returned by
 * `getServerSupabase()` or the post-`verifyOtp` session-bearing instance)
 * so RLS-aware reads see the right `auth.uid()`.
 *
 * Service-role boundary unchanged: ledger writes (billing_payments INSERT)
 * use the anon client + RLS; billing_intents RPCs use SECURITY DEFINER
 * functions that enforce ownership via `auth.uid()`.
 */
export async function createTopupForAuthedUser(args: {
  supabase: SupabaseClient;
  user: AuthedUser;
  input: TopupInput;
}): Promise<CreateTopupResult> {
  const { supabase, user, input } = args;
  const { package_code, intent } = input;

  const amount_kopeks = TOPUP_PACKAGE_KOPEKS[package_code];
  const amount_rub = amount_kopeks / 100;
  // `.bind(supabase)` preserves `this`. The detached-method anti-pattern
  // crashed prod on 2026-05-19 (PR #40); always bind before casting.
  const sbFrom = supabase.from.bind(supabase) as unknown as SbFrom;
  const sbRpcIntent = supabase.rpc.bind(supabase) as unknown as SbRpc<IntentRow[]>;
  const sbRpcVoid = supabase.rpc.bind(supabase) as unknown as SbRpc<unknown>;

  // -------------------------------------------------------------------
  // Intent ledger path (Phase 1.7.1). Skipped entirely for topup_only.
  // -------------------------------------------------------------------
  let intentId: string | null = null;
  let nonce: string | null = null;
  if (intent.kind !== 'topup_only') {
    nonce = generateNonce();
    const intentResult = await sbRpcIntent('fn_get_or_create_intent', {
      p_user_id: user.id,
      p_project_id: intent.project_id,
      p_kind: intent.kind,
      p_nonce: nonce,
      p_return_to: intent.return_to,
    });

    if (intentResult.error || !intentResult.data || intentResult.data.length === 0) {
      return {
        ok: false,
        error: {
          code: intentResult.error?.code ?? 'intent_error',
          message: intentResult.error?.message ?? 'Не удалось создать намерение оплаты.',
        },
      };
    }

    const row = intentResult.data[0] as IntentRow;
    intentId = row.intent_id;
    // Reuse the existing nonce if the intent was already pending — both
    // tabs end up with the same nonce, redirecting to the same checkout.
    nonce = row.out_nonce;

    // Two-tab payment reuse (Codex blocker fix #2 from Phase 1.7.1):
    // If a prior call already bound a billing_payment to this pending
    // intent, reuse its ЮKassa confirmation_url. DO NOT call
    // ЮKassa.Payment.create again — that would create a second
    // authorization on the user's card.
    //
    // Codex audit C #2: require the linked payment to be status='pending'.
    // A canceled/failed/refunded payment's confirmation_url is dead.
    if (row.out_billing_payment_id) {
      const lookup = await sbFrom('billing_payments')
        .select('id, status, metadata')
        .eq('id', row.out_billing_payment_id)
        .single();
      if (lookup.error || !lookup.data) {
        return {
          ok: false,
          error: {
            code: lookup.error?.code ?? 'payment_lookup_error',
            message: lookup.error?.message ?? 'Не удалось найти существующий платёж.',
          },
        };
      }
      const paymentStatus = lookup.data.status as string | undefined;
      if (paymentStatus !== 'pending') {
        return {
          ok: false,
          error: {
            code: 'intent_payment_dead',
            message:
              'Предыдущая попытка оплаты завершилась неуспешно. Начните заново через /upgrade.',
          },
        };
      }
      const meta = lookup.data.metadata as Record<string, unknown> | null;
      const confirmation = meta?.confirmation as Record<string, unknown> | undefined;
      const reusedUrl = confirmation?.confirmation_url as string | undefined;
      if (!reusedUrl) {
        return {
          ok: false,
          error: { code: 'payment_url_missing', message: 'Существующий платёж не содержит URL.' },
        };
      }
      return {
        ok: true,
        confirmation_url: reusedUrl,
        payment_id: row.out_billing_payment_id,
        nonce,
      };
    }
  }

  // -------------------------------------------------------------------
  // Standard ЮKassa Payment.create path.
  // -------------------------------------------------------------------
  // Intent-scoped Idempotence-Key (Codex audit C #1 from Phase 1.7.1):
  // two tabs racing past fn_get_or_create_intent before either binds a
  // payment will both reach this point with the same intent_id. Using
  // intent_id as the dedup key collapses both create() calls server-side
  // at ЮKassa, leaving only one real authorization. topup_only flow
  // keeps the legacy user+package+minute key.
  const minute = Math.floor(Date.now() / 60_000);
  const idempotence_key = intentId
    ? `topup-intent:${intentId}`
    : `topup:${user.id}:${package_code}:${minute}`;

  let return_url: string;
  if (intent.kind === 'topup_only') {
    return_url = 'https://mangopro.ru/profile?topup=pending';
  } else {
    // URL constructor handles existing ?query / #fragment correctly.
    const u = new URL(intent.return_to, 'https://mangopro.ru');
    if (nonce) u.searchParams.set('nonce', nonce);
    return_url = u.toString();
  }

  const metadata: Record<string, string> = {
    user_id: user.id,
    package_code,
  };
  if (nonce) metadata.intent_nonce = nonce;

  try {
    const payment = await createYooKassaPayment({
      amount_kopeks,
      description: `Mango Studio — пополнение баланса на ${amount_rub} ₽`,
      return_url,
      metadata,
      customer_email: user.email,
      idempotence_key,
    });

    const { error: insertError } = await sbFrom('billing_payments').insert({
      user_id: user.id,
      provider_payment_id: payment.id,
      amount_kopeks,
      currency: 'RUB',
      status: 'pending',
      package_code,
      metadata: payment as unknown as Record<string, unknown>,
      intent_id: intentId,
    });
    if (insertError && insertError.code !== '23505') {
      return {
        ok: false,
        error: { code: insertError.code ?? 'db_error', message: insertError.message },
      };
    }
    // 23505 = UNIQUE violation on provider_payment_id → idempotent retry,
    // payment was already recorded; continue.

    return await finalizeAndLink({
      intentId,
      payment,
      nonce,
      sbFrom,
      sbRpcVoid,
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'yookassa_error',
        message: err instanceof Error ? err.message : 'Не удалось создать платёж.',
      },
    };
  }
}

/**
 * Post-create finalisation: link payment ↔ intent in a SEPARATE try/catch.
 *
 * Codex Sub-phase B audit 2026-05-20: previously the link RPC ran inside
 * the main YooKassa try, so an RPC throw AFTER successful payment.create +
 * billing_payments INSERT would return `yookassa_error` — falsely
 * reporting "payment failed" when in fact the user was charged and the
 * row exists. The link is best-effort by design (webhook uses
 * provider_payment_id as the join key), so we treat link failures as
 * non-fatal: log + still return the confirmation URL.
 */
async function finalizeAndLink(args: {
  intentId: string | null;
  payment: { id: string; confirmation: { confirmation_url: string } };
  nonce: string | null;
  sbFrom: SbFrom;
  sbRpcVoid: SbRpc<unknown>;
}): Promise<CreateTopupResult> {
  const { intentId, payment, nonce, sbFrom, sbRpcVoid } = args;

  if (intentId) {
    try {
      const lookup = await sbFrom('billing_payments')
        .select('id')
        .eq('provider_payment_id', payment.id)
        .single();
      const localId = (lookup.data?.id as string | undefined) ?? null;
      if (localId) {
        const linkResult = await sbRpcVoid('fn_link_payment_to_intent', {
          p_intent_id: intentId,
          p_billing_payment_id: localId,
        });
        if (linkResult.error) {
          console.warn('[topup-core] link_payment_to_intent failed (non-fatal)', {
            intentId,
            payment_id: payment.id,
            code: linkResult.error.code,
            message: linkResult.error.message,
          });
        }
      }
    } catch (err) {
      // RPC layer threw — log + continue. The payment exists, the row
      // exists, the webhook will settle via provider_payment_id join.
      console.warn('[topup-core] link_payment_to_intent threw (non-fatal)', {
        intentId,
        payment_id: payment.id,
        errName: err instanceof Error ? err.name : 'unknown',
        errMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: true,
    confirmation_url: payment.confirmation.confirmation_url,
    payment_id: payment.id,
    ...(nonce ? { nonce } : {}),
  };
}
