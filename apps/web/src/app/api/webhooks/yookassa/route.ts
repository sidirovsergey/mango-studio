import { clientIpFromRequest, isYooKassaIp } from '@/server/lib/yookassa-ip-allowlist';
import { getServiceRoleSupabase } from '@mango/db/server';

export const runtime = 'nodejs';

interface YooKassaWebhookEvent {
  type?: string;
  event: string;
  object: {
    id: string;
    status: string;
    amount?: { value: string; currency: string };
  };
}

// Phase 1.7.1 — minimal typings to bypass Supabase generated-types lag on
// billing_payments + billing_intents.
type BillingSupabase = {
  rpc: <T>(
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { code?: string; message: string } | null }>;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
};

/**
 * ЮKassa webhook receiver.
 *
 * Phase 1.7.0 BUG FIX (Phase 1.7.1 ships this): the webhook MUST use a
 * service-role client. Previous v1.7.0 used getServerSupabase() (anon JWT)
 * which couldn't actually call fn_apply_topup — that fn is REVOKEd from
 * anon/authenticated and GRANTed only to service_role. The webhook was
 * shipped but never exercised in prod (operator credited balances via
 * direct SQL until the 1.7.1 fix landed).
 *
 * Phase 1.7.1 addition: after fn_apply_topup credits balance, look up the
 * billing_payments row's intent_id. If set, call fn_settle_paid_intent
 * which atomically promotes the bound billing_intents row from
 * 'pending'|'expired' → 'paid'. Webhook does NOT auto-enqueue render —
 * that runs on user return to /p/{slug}?nonce=X via dispatchRenderAction
 * (architectural decision: 15s webhook budget vs N×fal.ai submissions;
 * see enqueueRenderForProject module doc).
 *
 * runtime='nodejs' (NOT edge) — needs Buffer + ipaddr.js + DB client.
 */
export async function POST(req: Request): Promise<Response> {
  // IP allowlist (Codex SHOULD-FIX #4 from v1.7.0)
  const ip = clientIpFromRequest(req);
  if (!isYooKassaIp(ip)) {
    return new Response('forbidden', { status: 403 });
  }

  let event: YooKassaWebhookEvent;
  try {
    event = (await req.json()) as YooKassaWebhookEvent;
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (!event?.event || !event?.object?.id) {
    return new Response('malformed', { status: 400 });
  }

  const supabase = getServiceRoleSupabase() as unknown as BillingSupabase;
  const providerPaymentId = event.object.id;

  if (event.event === 'payment.succeeded') {
    const amountRub = Number.parseFloat(event.object.amount?.value ?? '');
    if (!Number.isFinite(amountRub) || amountRub <= 0) {
      return new Response('bad amount', { status: 400 });
    }
    const observedKopeks = Math.round(amountRub * 100);

    // Step 1: credit balance via v1.7.0 fn_apply_topup. Idempotent by
    // billing_payments.status='pending' guard; replay returns silently.
    const apply = await supabase.rpc<unknown>('fn_apply_topup', {
      p_provider_payment_id: providerPaymentId,
      p_observed_amount_kopeks: observedKopeks,
    });
    if (apply.error) {
      console.error('[yookassa] fn_apply_topup failed', {
        providerPaymentId,
        error: apply.error,
      });
      return new Response('db error', { status: 500 });
    }

    // Step 2 (Phase 1.7.1): if this payment is bound to an intent, promote
    // the intent. Look up the billing_payments row by provider_payment_id
    // (UNIQUE) to get its local id + intent_id.
    const lookup = await supabase
      .from('billing_payments')
      .select('id, intent_id')
      .eq('provider_payment_id', providerPaymentId)
      .single();
    if (lookup.error) {
      // fn_apply_topup may have created the row or promoted it; either way,
      // a SELECT after should succeed. Log + ignore — balance is credited,
      // intent settlement is best-effort.
      console.error('[yookassa] billing_payments lookup failed', {
        providerPaymentId,
        error: lookup.error,
      });
      return new Response('ok', { status: 200 });
    }

    const paymentRow = lookup.data as
      | { id: string; intent_id: string | null }
      | null;
    if (paymentRow?.intent_id) {
      const settle = await supabase.rpc<string | null>('fn_settle_paid_intent', {
        p_billing_payment_id: paymentRow.id,
      });
      if (settle.error) {
        console.error('[yookassa] fn_settle_paid_intent failed', {
          providerPaymentId,
          paymentId: paymentRow.id,
          intentId: paymentRow.intent_id,
          error: settle.error,
        });
        // Non-fatal: balance is credited, intent stays 'pending'. Cron sweep
        // will mark it 'expired' after TTL; user can still manually trigger
        // render from the project page with their now-credited balance.
        return new Response('ok', { status: 200 });
      }
      // settle.data === intent_id on first transition, NULL on replay.
      // We don't auto-enqueue here (15s budget concern). The intent flips
      // to 'consumed' when the user lands on /p/{slug}?nonce=X and the
      // dispatchRenderAction succeeds.
    }

    return new Response('ok', { status: 200 });
  }

  if (event.event === 'payment.canceled') {
    await supabase
      .from('billing_payments')
      .update({ status: 'canceled' })
      .eq('provider_payment_id', providerPaymentId);
    return new Response('ok', { status: 200 });
  }

  if (event.event === 'payment.waiting_for_capture') {
    // Rare with capture:true on Payment.create. Acknowledge.
    return new Response('ok', { status: 200 });
  }

  console.warn('[yookassa] unknown event', { type: event.type, event: event.event });
  return new Response('ok', { status: 200 });
}
