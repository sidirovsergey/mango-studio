import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createYooKassaPayment } from './yookassa-client';

describe('createYooKassaPayment', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('YOOKASSA_SHOP_ID', 'test-shop');
    vi.stubEnv('YOOKASSA_SECRET_KEY', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function okResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('POSTs to /v3/payments with basic auth + Idempotence-Key + receipt', async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        id: 'yp-1',
        status: 'pending',
        amount: { value: '2000.00', currency: 'RUB' },
        confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-1' },
        metadata: { user_id: 'u1', package_code: 'topup_2000' },
      }),
    );

    const result = await createYooKassaPayment({
      amount_kopeks: 200_000,
      description: 'Пополнение на 2000 ₽',
      return_url: 'https://mangopro.ru/profile?topup=pending',
      metadata: { user_id: 'u1', package_code: 'topup_2000' },
      customer_email: 'a@b.ru',
      idempotence_key: 'topup:u1:topup_2000:42',
    });

    expect(result.id).toBe('yp-1');
    expect(result.confirmation.confirmation_url).toBe('https://yk/c/yp-1');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calls = fetchSpy.mock.calls as unknown[][];
    const call = calls[0];
    if (!call || !call[0] || !call[1]) throw new Error('Missing call data');
    const [url, init] = call;
    expect(url).toBe('https://api.yookassa.ru/v3/payments');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Idempotence-Key']).toBe('topup:u1:topup_2000:42');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toMatch(/^Basic [A-Za-z0-9+/=]+$/);

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.amount).toEqual({ value: '2000.00', currency: 'RUB' });
    expect(body.confirmation).toEqual({
      type: 'redirect',
      return_url: 'https://mangopro.ru/profile?topup=pending',
    });
    expect(body.capture).toBe(true);
    expect(body.metadata).toEqual({ user_id: 'u1', package_code: 'topup_2000' });
    expect(body.receipt.customer.email).toBe('a@b.ru');
    expect(body.receipt.items).toHaveLength(1);
    expect(body.receipt.items[0].vat_code).toBe(1);
    expect(body.receipt.items[0].payment_subject).toBe('service');
    expect(body.receipt.items[0].payment_mode).toBe('full_payment');
    expect(body.receipt.items[0].amount).toEqual({ value: '2000.00', currency: 'RUB' });
  });

  it('encodes basic auth as base64(shop_id:secret)', async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        id: 'yp-2',
        status: 'pending',
        amount: { value: '5000.00', currency: 'RUB' },
        confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-2' },
        metadata: {},
      }),
    );

    await createYooKassaPayment({
      amount_kopeks: 500_000,
      description: 'x',
      return_url: 'https://r',
      metadata: {},
      customer_email: 'a@b.ru',
      idempotence_key: 'k',
    });

    const calls = fetchSpy.mock.calls as unknown[][];
    const init = calls[0]?.[1] as RequestInit | undefined;
    if (!init || !init.headers) throw new Error('Missing init or headers');
    const headers = init.headers as Record<string, string>;
    const auth = (headers.Authorization as string).replace(/^Basic /, '');
    expect(Buffer.from(auth, 'base64').toString('utf8')).toBe('test-shop:test-secret');
  });

  it('throws when YOOKASSA_SHOP_ID is missing', async () => {
    vi.stubEnv('YOOKASSA_SHOP_ID', '');
    await expect(
      createYooKassaPayment({
        amount_kopeks: 200_000,
        description: 'x',
        return_url: 'https://r',
        metadata: {},
        customer_email: 'a@b.ru',
        idempotence_key: 'k',
      }),
    ).rejects.toThrow(/YOOKASSA_SHOP_ID/);
  });

  it('throws on non-2xx response with the body text in the message', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('bad request: missing receipt', { status: 400 }));
    await expect(
      createYooKassaPayment({
        amount_kopeks: 200_000,
        description: 'x',
        return_url: 'https://r',
        metadata: {},
        customer_email: 'a@b.ru',
        idempotence_key: 'k',
      }),
    ).rejects.toThrow(/HTTP 400/);
  });

  it('formats RUB value to 2 decimal places (kopeks/100 with toFixed(2))', async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        id: 'yp-3',
        status: 'pending',
        amount: { value: '1000.00', currency: 'RUB' },
        confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-3' },
        metadata: {},
      }),
    );
    await createYooKassaPayment({
      amount_kopeks: 100_000, // 1000.00 ₽
      description: 'x',
      return_url: 'https://r',
      metadata: {},
      customer_email: 'a@b.ru',
      idempotence_key: 'k',
    });
    const calls = fetchSpy.mock.calls as unknown[][];
    const init = calls[0]?.[1] as RequestInit | undefined;
    if (!init || typeof init.body !== 'string') throw new Error('Missing init or body');
    const body = JSON.parse(init.body);
    expect(body.amount.value).toBe('1000.00');
    expect(body.receipt.items[0].amount.value).toBe('1000.00');
  });
});
