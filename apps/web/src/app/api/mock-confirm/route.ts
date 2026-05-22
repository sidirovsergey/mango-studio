import { getServiceRoleSupabase } from '@mango/db/server';

export const runtime = 'nodejs';

/**
 * Mock payment confirmation endpoint. Gated by MOCK_YOOKASSA env (see
 * apps/web/src/server/lib/yookassa-client.ts). Mirrors the
 * /api/webhooks/yookassa post-succeed flow:
 *
 *   1. fn_apply_topup (credit balance — idempotent on status='pending')
 *   2. fn_settle_paid_intent (intent → 'paid' — idempotent on consumed_at IS NULL)
 *   3. Build the same /p/{slug}?nonce=… return URL the real flow would
 *      have used (sourced from billing_payments.metadata which we wrote
 *      with the ЮKassa-shaped mock response).
 *
 * Security:
 *   - Returns 404 unless MOCK_YOOKASSA='true' (no surface in real prod).
 *   - Rejects payment_id that doesn't start with 'mock_' — prevents the
 *     route from being abused to credit real (non-mock) payments.
 *   - Uses billing_payments.amount_kopeks (server-side, not body) for the
 *     observed amount passed to fn_apply_topup. Body cannot inflate.
 *   - fn_apply_topup itself is REVOKEd from anon/authenticated and granted
 *     only to service_role; same boundary as the real webhook.
 *
 * Same return shape contract as the mock-checkout form expects:
 *   { ok: true, redirect: <return_to> } | { ok: false, error: <message> }
 */
type ConfirmBody = { payment_id?: string };

type BillingSupabase = {
  rpc: <T>(
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { code?: string; message: string } | null }>;
  from: (table: string) => {
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
};

function notFound(): Response {
  return new Response('not found', { status: 404 });
}

export async function POST(req: Request): Promise<Response> {
  if (process.env.MOCK_YOOKASSA !== 'true') {
    return notFound();
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'bad json' }, { status: 400 });
  }
  if (!parsed || typeof parsed !== 'object') {
    return Response.json({ ok: false, error: 'body must be a json object' }, { status: 400 });
  }
  const body = parsed as ConfirmBody;
  const paymentId = body.payment_id;
  if (!paymentId || typeof paymentId !== 'string' || !paymentId.startsWith('mock_')) {
    return Response.json({ ok: false, error: 'payment_id must be a mock_ id' }, { status: 400 });
  }

  const sb = getServiceRoleSupabase() as unknown as BillingSupabase;

  // Look up the pending mock payment so we can pass its own amount to
  // fn_apply_topup (NOT a value supplied by the caller).
  const lookup = await sb
    .from('billing_payments')
    .select('id, amount_kopeks, intent_id, metadata')
    .eq('provider_payment_id', paymentId)
    .single();

  if (lookup.error || !lookup.data) {
    return Response.json(
      { ok: false, error: lookup.error?.message ?? 'payment not found' },
      { status: 404 },
    );
  }

  const row = lookup.data as {
    id: string;
    amount_kopeks: number;
    intent_id: string | null;
    metadata: Record<string, unknown> | null;
  };

  const apply = await sb.rpc<unknown>('fn_apply_topup', {
    p_provider_payment_id: paymentId,
    p_observed_amount_kopeks: row.amount_kopeks,
  });
  if (apply.error) {
    console.error('[mock-confirm] fn_apply_topup failed', {
      paymentId,
      code: apply.error.code,
      message: apply.error.message,
    });
    return Response.json({ ok: false, error: 'apply_topup failed' }, { status: 500 });
  }

  if (row.intent_id) {
    const settle = await sb.rpc<string | null>('fn_settle_paid_intent', {
      p_billing_payment_id: row.id,
    });
    if (settle.error) {
      console.error('[mock-confirm] fn_settle_paid_intent failed', {
        paymentId,
        intent_id: row.intent_id,
        code: settle.error.code,
        message: settle.error.message,
      });
      return Response.json({ ok: false, error: 'settle failed' }, { status: 500 });
    }
  }

  // Reconstruct the return URL from the metadata blob we stored at
  // create-time. The mock response's confirmation_url has return=…
  // encoded; we round-trip via metadata for a clean source of truth.
  const confirmation = row.metadata?.confirmation as { confirmation_url?: string } | undefined;
  let redirect = '/';
  try {
    if (confirmation?.confirmation_url) {
      const u = new URL(confirmation.confirmation_url, 'https://mangopro.ru');
      const ret = u.searchParams.get('return');
      if (ret) redirect = ret;
    }
  } catch {
    // Fallback already set to '/'.
  }

  return Response.json({ ok: true, redirect }, { status: 200 });
}
