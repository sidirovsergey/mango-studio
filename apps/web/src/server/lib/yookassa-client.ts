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
