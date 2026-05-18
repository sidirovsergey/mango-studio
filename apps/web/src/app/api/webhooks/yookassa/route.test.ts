import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn(),
}));

vi.mock('@/server/lib/yookassa-ip-allowlist', async () => {
  const actual = await vi.importActual<typeof import('@/server/lib/yookassa-ip-allowlist')>(
    '@/server/lib/yookassa-ip-allowlist',
  );
  return {
    ...actual,
    isYooKassaIp: vi.fn(),
    clientIpFromRequest: vi.fn(),
  };
});

import { clientIpFromRequest, isYooKassaIp } from '@/server/lib/yookassa-ip-allowlist';
import { getServerSupabase } from '@mango/db/server';
import { POST } from './route';

function jsonReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/webhooks/yookassa', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function makeSupabase(
  opts: { rpcResult?: { data: unknown; error: unknown }; updateResult?: { error: unknown } } = {},
) {
  const rpc = vi.fn().mockResolvedValue(opts.rpcResult ?? { data: null, error: null });
  const updateEq = vi.fn().mockResolvedValue(opts.updateResult ?? { error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  return {
    rpc,
    from: vi.fn().mockReturnValue({ update }),
    __rpc: rpc,
    __update: update,
    __updateEq: updateEq,
  };
}

describe('POST /api/webhooks/yookassa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (clientIpFromRequest as unknown as ReturnType<typeof vi.fn>).mockReturnValue('185.71.76.10');
    (isYooKassaIp as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 when IP not in allowlist', async () => {
    (isYooKassaIp as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const res = await POST(jsonReq({ event: 'payment.succeeded', object: { id: 'yp-1' } }));
    expect(res.status).toBe(403);
    expect(getServerSupabase).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON', async () => {
    const res = await POST(jsonReq('{bad json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when event field missing', async () => {
    const res = await POST(jsonReq({ object: { id: 'yp-1' } }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when object.id missing', async () => {
    const res = await POST(jsonReq({ event: 'payment.succeeded' }));
    expect(res.status).toBe(400);
  });

  it('payment.succeeded → calls fn_apply_topup with correct args → 200', async () => {
    const sb = makeSupabase({ rpcResult: { data: null, error: null } });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const res = await POST(
      jsonReq({
        type: 'notification',
        event: 'payment.succeeded',
        object: { id: 'yp-1', status: 'succeeded', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(200);
    expect(sb.__rpc).toHaveBeenCalledWith('fn_apply_topup', {
      p_provider_payment_id: 'yp-1',
      p_observed_amount_kopeks: 200_000,
    });
  });

  it('payment.succeeded with bad amount value → 400', async () => {
    const sb = makeSupabase();
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const res = await POST(
      jsonReq({
        event: 'payment.succeeded',
        object: {
          id: 'yp-1',
          status: 'succeeded',
          amount: { value: 'not-a-number', currency: 'RUB' },
        },
      }),
    );

    expect(res.status).toBe(400);
  });

  it('payment.succeeded but RPC errors → 500 (so ЮKassa retries)', async () => {
    const sb = makeSupabase({
      rpcResult: { data: null, error: { code: 'XX000', message: 'connection lost' } },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const res = await POST(
      jsonReq({
        event: 'payment.succeeded',
        object: { id: 'yp-1', status: 'succeeded', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(500);
  });

  it('payment.canceled → UPDATE billing_payments status=canceled → 200', async () => {
    const sb = makeSupabase({ updateResult: { error: null } });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const res = await POST(
      jsonReq({
        event: 'payment.canceled',
        object: { id: 'yp-1', status: 'canceled', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith('billing_payments');
    expect(sb.__update).toHaveBeenCalledWith({ status: 'canceled' });
    expect(sb.__updateEq).toHaveBeenCalledWith('provider_payment_id', 'yp-1');
  });

  it('payment.waiting_for_capture → 200 ack only (no DB write)', async () => {
    const sb = makeSupabase();
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const res = await POST(
      jsonReq({
        event: 'payment.waiting_for_capture',
        object: {
          id: 'yp-1',
          status: 'waiting_for_capture',
          amount: { value: '2000.00', currency: 'RUB' },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(sb.__rpc).not.toHaveBeenCalled();
    expect(sb.__update).not.toHaveBeenCalled();
  });

  it('unknown event → 200 + log (forward-compat)', async () => {
    const sb = makeSupabase();
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await POST(
      jsonReq({
        event: 'payment.refunded',
        object: { id: 'yp-1', status: 'refunded', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
