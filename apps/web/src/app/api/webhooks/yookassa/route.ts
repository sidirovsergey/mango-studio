import { clientIpFromRequest, isYooKassaIp } from '@/server/lib/yookassa-ip-allowlist';
import { getServerSupabase } from '@mango/db/server';

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

// billing_payments is not yet in generated Supabase types (migration added in Phase 1.7).
// Cast through unknown to bypass overload constraint — same pattern as createTopupAction (E3).
type BillingSupabase = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
  from: (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
};

/**
 * ЮKassa webhook receiver. Codex BLOCKER #2/#4 fixes live in the DB function
 * fn_apply_topup — this handler derives nothing trust-sensitive from the
 * webhook body. We just pass (provider_payment_id, observed_amount_kopeks)
 * to the SECURITY DEFINER function, which looks up the stored row,
 * validates the amount matches, and credits balance.
 *
 * runtime='nodejs' (NOT edge) — needs Buffer + ipaddr.js + DB client.
 */
export async function POST(req: Request): Promise<Response> {
  // IP allowlist (Codex SHOULD-FIX #4)
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

  const supabase = (await getServerSupabase()) as unknown as BillingSupabase;
  const providerPaymentId = event.object.id;

  if (event.event === 'payment.succeeded') {
    const amountRub = Number.parseFloat(event.object.amount?.value ?? '');
    if (!Number.isFinite(amountRub) || amountRub <= 0) {
      return new Response('bad amount', { status: 400 });
    }
    const observedKopeks = Math.round(amountRub * 100);
    const { error } = await supabase.rpc('fn_apply_topup', {
      p_provider_payment_id: providerPaymentId,
      p_observed_amount_kopeks: observedKopeks,
    });
    if (error) {
      console.error('[yookassa] fn_apply_topup failed', { providerPaymentId, error });
      return new Response('db error', { status: 500 });
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
