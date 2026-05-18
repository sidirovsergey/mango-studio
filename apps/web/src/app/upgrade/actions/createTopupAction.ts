'use server';

import { randomBytes } from 'node:crypto';

import { createYooKassaPayment } from '@/server/lib/yookassa-client';
import { TOPUP_PACKAGE_KOPEKS, TopupInputSchema } from '@mango/core/billing';
import { getServerSupabase } from '@mango/db/server';
import { redirect } from 'next/navigation';

export type CreateTopupResult =
  | { ok: true; confirmation_url: string; payment_id: string; nonce?: string }
  | { ok: false; error: { code: string; message: string } };

/**
 * 16-char base64url nonce ≈ 95.27 bits of entropy (62^16 — alphanumeric +
 * url-safe). Used as a bearer token in /p/{slug}?nonce=X during the
 * post-payment redirect; RLS on billing_intents enforces user_id match so
 * a stolen nonce cannot be redeemed by another user.
 */
function generateNonce(): string {
  return randomBytes(12).toString('base64url').slice(0, 16);
}

// Local minimal typings to bypass Supabase generated-types lag on
// billing_payments + billing_intents (added in Phase 1.7 + 1.7.1 migrations
// — `supabase gen types` not re-run yet).
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

export async function createTopupAction(input: unknown): Promise<CreateTopupResult> {
  const parsed = TopupInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_package', message: 'Неверный пакет.' } };
  }
  const { package_code, intent } = parsed.data;

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || user.is_anonymous || !user.email) {
    redirect('/login');
  }
  const authedUser = user as { id: string; email: string };

  const amount_kopeks = TOPUP_PACKAGE_KOPEKS[package_code];
  const amount_rub = amount_kopeks / 100;
  const sbFrom = supabase.from as unknown as SbFrom;
  const sbRpcIntent = supabase.rpc as unknown as SbRpc<IntentRow[]>;
  const sbRpcVoid = supabase.rpc as unknown as SbRpc<unknown>;

  // ---------------------------------------------------------------------
  // Intent ledger path (Phase 1.7.1). Skipped entirely for topup_only.
  // ---------------------------------------------------------------------
  let intentId: string | null = null;
  let nonce: string | null = null;
  if (intent.kind !== 'topup_only') {
    nonce = generateNonce();
    const intentResult = await sbRpcIntent('fn_get_or_create_intent', {
      p_user_id: authedUser.id,
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

    // Codex blocker fix #2 — two-tab payment reuse:
    // If a prior call already bound a billing_payment to this pending intent,
    // reuse its ЮKassa confirmation_url. DO NOT call ЮKassa.Payment.create
    // again — that would create a second authorisation on the user's card.
    //
    // Codex audit C #2: also require the linked payment to be status='pending'.
    // A canceled/failed/refunded payment's confirmation_url is dead; reusing
    // it would send the user to a broken checkout page.
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
        // Linked payment is dead — intent is locked to it via UNIQUE
        // (project_id, kind) WHERE status='pending'. User must start fresh.
        // Operator can manually cancel the intent via SQL with audit.
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
          error: {
            code: 'payment_url_missing',
            message: 'Существующий платёж не содержит URL.',
          },
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

  // ---------------------------------------------------------------------
  // Standard ЮKassa Payment.create path.
  // ---------------------------------------------------------------------
  // Codex audit C #1: use intent-scoped Idempotence-Key when in intent flow.
  // If two tabs race past fn_get_or_create_intent BEFORE either binds a
  // billing_payment, both reach this point with the same intent_id. Using
  // intent_id as the dedup key collapses both ЮKassa.Payment.create calls
  // server-side at ЮKassa, leaving only one real authorisation. Legacy
  // topup_only flow keeps the v1.7.0 user+package+minute key.
  const minute = Math.floor(Date.now() / 60_000);
  const idempotence_key = intentId
    ? `topup-intent:${intentId}`
    : `topup:${authedUser.id}:${package_code}:${minute}`;

  // Codex audit C #3: use URL constructor to safely embed nonce in
  // return_url. String concatenation breaks when return_to contains
  // '?' or '#'. Schema already enforces same-origin; URL ctor handles
  // existing query params + fragments correctly.
  let return_url: string;
  if (intent.kind === 'topup_only') {
    return_url = 'https://mangopro.ru/profile?topup=pending';
  } else {
    const u = new URL(intent.return_to, 'https://mangopro.ru');
    if (nonce) u.searchParams.set('nonce', nonce);
    return_url = u.toString();
  }

  const metadata: Record<string, string> = {
    user_id: authedUser.id,
    package_code,
  };
  if (nonce) metadata.intent_nonce = nonce;

  try {
    const payment = await createYooKassaPayment({
      amount_kopeks,
      description: `Mango Studio — пополнение баланса на ${amount_rub} ₽`,
      return_url,
      metadata,
      customer_email: authedUser.email,
      idempotence_key,
    });

    const { error: insertError } = await sbFrom('billing_payments').insert({
      user_id: authedUser.id,
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

    // Link payment to intent (best-effort; webhook lookup uses
    // provider_payment_id as the join key so missing link doesn't break
    // settlement, but having the link populated helps debugging + future
    // intent-aware queries).
    if (intentId) {
      const lookup = await sbFrom('billing_payments')
        .select('id')
        .eq('provider_payment_id', payment.id)
        .single();
      const localId = (lookup.data?.id as string | undefined) ?? null;
      if (localId) {
        await sbRpcVoid('fn_link_payment_to_intent', {
          p_intent_id: intentId,
          p_billing_payment_id: localId,
        });
      }
    }

    return {
      ok: true,
      confirmation_url: payment.confirmation.confirmation_url,
      payment_id: payment.id,
      ...(nonce ? { nonce } : {}),
    };
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
