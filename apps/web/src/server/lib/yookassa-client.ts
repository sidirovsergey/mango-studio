import 'server-only';

export interface YooKassaCreatePaymentInput {
  amount_kopeks: number;
  description: string;
  return_url: string;
  metadata: Record<string, string>;
  customer_email: string;
  idempotence_key: string;
}

export interface YooKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  amount: { value: string; currency: 'RUB' };
  confirmation: { type: 'redirect'; confirmation_url: string };
  metadata: Record<string, string>;
}

/**
 * Creates a ЮKassa payment intent via POST /v3/payments. Raw HTTP — no SDK.
 *
 * MUST include a 54-ФЗ receipt block (Codex SHOULD-FIX #3) — Russian
 * fiscalization law requires it for any card payment from a physical
 * person. Without it ЮKassa returns HTTP 400 in production OR (worse, in
 * test mode) accepts the payment but the operator gets fined later.
 *
 * vat_code: 1 → "не облагается НДС" (applies to СМЗ self-employed).
 * If the operator legal status changes (e.g. ИП on УСН), revisit vat_code
 * with the accountant before flipping live keys.
 *
 * Env read per-call so tests can stub via vi.stubEnv.
 */
export async function createYooKassaPayment(
  input: YooKassaCreatePaymentInput,
): Promise<YooKassaPayment> {
  // MOCK_YOOKASSA toggle (added for ЮKassa acquirer approval review, 2026-05-20).
  // When set to 'true', the real Payment.create HTTP call is skipped and a
  // ЮKassa-shaped mock response is returned. confirmation_url points to
  // our local /mock-checkout page, which renders a payment-page-like UI
  // and on confirm calls /api/mock-confirm — which uses service_role to
  // run fn_apply_topup + fn_settle_paid_intent, then redirects to the
  // real return_url (/p/{slug}?nonce=…). Real webhook handler, intent
  // ledger, render dispatcher, and auth flow are all unchanged. Remove
  // the env var (or set to anything other than 'true') to restore the
  // real ЮKassa branch — single-toggle rollback.
  if (process.env.MOCK_YOOKASSA === 'true') {
    return buildMockPayment(input);
  }

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId) throw new Error('YOOKASSA_SHOP_ID not configured');
  if (!secret) throw new Error('YOOKASSA_SECRET_KEY not configured');

  const auth = Buffer.from(`${shopId}:${secret}`).toString('base64');
  const rubValue = (input.amount_kopeks / 100).toFixed(2);

  const body = {
    amount: { value: rubValue, currency: 'RUB' as const },
    confirmation: { type: 'redirect' as const, return_url: input.return_url },
    capture: true,
    description: input.description,
    metadata: input.metadata,
    receipt: {
      customer: { email: input.customer_email },
      items: [
        {
          description: input.description,
          quantity: '1.00',
          amount: { value: rubValue, currency: 'RUB' as const },
          vat_code: 1,
          payment_subject: 'service',
          payment_mode: 'full_payment',
        },
      ],
    },
  };

  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': input.idempotence_key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ЮKassa Payment.create failed: HTTP ${res.status} ${errBody}`);
  }

  return (await res.json()) as YooKassaPayment;
}

/**
 * Build a ЮKassa-shaped response without calling the real API. Used only
 * when MOCK_YOOKASSA env is set (see top of createYooKassaPayment). The
 * mock id is prefixed `mock_` so downstream code paths (webhook, mock-
 * confirm) can distinguish mock from real payments by inspection. The
 * confirmation_url points at our own /mock-checkout page; the real
 * return_url is encoded into the query so the mock page can redirect to
 * it after «оплата» completes.
 */
function buildMockPayment(input: YooKassaCreatePaymentInput): YooKassaPayment {
  const rubValue = (input.amount_kopeks / 100).toFixed(2);
  // Use APP_URL so the mock page redirects work in any deployment
  // (preview, prod). Fallback to relative URL — Next.js routes will
  // resolve from the current origin in the browser.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const mockId = `mock_${input.idempotence_key}`;
  const confirmation_url =
    `${appUrl}/mock-checkout` +
    `?id=${encodeURIComponent(mockId)}` +
    `&return=${encodeURIComponent(input.return_url)}` +
    `&amount=${encodeURIComponent(rubValue)}` +
    `&description=${encodeURIComponent(input.description)}`;
  return {
    id: mockId,
    status: 'pending',
    amount: { value: rubValue, currency: 'RUB' },
    confirmation: { type: 'redirect', confirmation_url },
    metadata: input.metadata,
  };
}
