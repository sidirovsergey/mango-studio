import { getServerSupabase } from '@mango/db/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Phase 1.7.1 — lightweight poller endpoint for PaymentPendingView.
 *
 * Replaces the v1 full-page reload-every-3s pattern (Codex audit E #2:
 * ~100 RSC renders per waiting user during a 5-min wait). This route is
 * a single small JSON response.
 *
 * Security: relies on fn_inspect_intent's built-in RLS check
 * (bi.user_id = auth.uid()). Nonce that doesn't belong to the caller
 * returns 404; no information leak.
 */
type IntentInspectRow = {
  intent_id: string;
  project_id: string;
  kind: 'render' | 'studio' | 'topup_only';
  return_to: string;
  intent_status: 'pending' | 'paid' | 'consumed' | 'expired' | 'canceled';
  payment_status: 'pending' | 'succeeded' | 'canceled' | 'failed' | 'refunded' | null;
  expires_at: string;
};

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const nonce = url.searchParams.get('nonce');
  if (!nonce) {
    return NextResponse.json({ ok: false, error: 'missing nonce' }, { status: 400 });
  }

  const sb = await getServerSupabase();
  const rpc = sb.rpc.bind(sb) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: IntentInspectRow[] | null; error: { message: string } | null }>;
  const inspect = await rpc('fn_inspect_intent', { p_nonce: nonce });

  if (inspect.error || !inspect.data || inspect.data.length === 0) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  const row = inspect.data[0] as IntentInspectRow;
  return NextResponse.json(
    {
      ok: true,
      intent_status: row.intent_status,
      payment_status: row.payment_status,
    },
    {
      headers: {
        // Defence-in-depth: the URL contains the nonce in query string.
        // Set Referrer-Policy here too (middleware doesn't match /api/* by default).
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}
