import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn(),
  getServiceRoleSupabase: vi.fn(),
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
import { getServiceRoleSupabase } from '@mango/db/server';
import { POST } from './route';

function jsonReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/webhooks/yookassa', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * Mock supports:
 *  - .rpc(fn, args) — multiple fns dispatched via rpcByFn
 *  - .from(table).select(cols).eq(col, val).single() → payment lookup
 *  - .from(table).update(row).eq(col, val) → cancel path
 */
function makeSupabase(
  opts: {
    rpcByFn?: Record<string, { data?: unknown; error?: { code?: string; message: string } | null }>;
    selectRow?: Record<string, unknown> | null;
    selectError?: { code?: string; message: string } | null;
    updateResult?: { error: unknown };
  } = {},
) {
  const rpc = vi.fn().mockImplementation((fn: string) => {
    const r = opts.rpcByFn?.[fn];
    return Promise.resolve({ data: r?.data ?? null, error: r?.error ?? null });
  });
  const single = vi.fn().mockResolvedValue({
    data: opts.selectRow ?? null,
    error: opts.selectError ?? null,
  });
  const selectEq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: selectEq });
  const updateEq = vi.fn().mockResolvedValue(opts.updateResult ?? { error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const from = vi.fn().mockReturnValue({ select, update });
  return {
    rpc,
    from,
    _rpc: rpc,
    _from: from,
    _update: update,
    _updateEq: updateEq,
    _select: select,
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
    expect(getServiceRoleSupabase).not.toHaveBeenCalled();
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

  it('payment.succeeded → fn_apply_topup, no intent → lookup runs but returns paymentRow.intent_id=null', async () => {
    const sb = makeSupabase({
      rpcByFn: { fn_apply_topup: { data: null } },
      selectRow: { id: 'bp-1', intent_id: null },
    });
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);

    const res = await POST(
      jsonReq({
        type: 'notification',
        event: 'payment.succeeded',
        object: { id: 'yp-1', status: 'succeeded', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(200);
    expect(sb._rpc).toHaveBeenCalledWith('fn_apply_topup', {
      p_provider_payment_id: 'yp-1',
      p_observed_amount_kopeks: 200_000,
    });
    // No second RPC for fn_settle_paid_intent because intent_id was null.
    expect(sb._rpc).toHaveBeenCalledTimes(1);
  });

  it('payment.succeeded with bad amount value → 400', async () => {
    const sb = makeSupabase();
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);

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

  it('payment.succeeded but fn_apply_topup errors → 500 (so ЮKassa retries)', async () => {
    const sb = makeSupabase({
      rpcByFn: { fn_apply_topup: { error: { code: 'XX000', message: 'connection lost' } } },
    });
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);

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
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);

    const res = await POST(
      jsonReq({
        event: 'payment.canceled',
        object: { id: 'yp-1', status: 'canceled', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(200);
    expect(sb._from).toHaveBeenCalledWith('billing_payments');
    expect(sb._update).toHaveBeenCalledWith({ status: 'canceled' });
    expect(sb._updateEq).toHaveBeenCalledWith('provider_payment_id', 'yp-1');
  });

  it('payment.waiting_for_capture → 200 ack only (no DB write)', async () => {
    const sb = makeSupabase();
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);

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
    expect(sb._rpc).not.toHaveBeenCalled();
    expect(sb._update).not.toHaveBeenCalled();
  });

  it('unknown event → 200 + log (forward-compat)', async () => {
    const sb = makeSupabase();
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);
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

  // ---------------------------------------------------------------------
  // Phase 1.7.1 — intent settlement
  // ---------------------------------------------------------------------

  it('payment.succeeded WITH intent_id → calls fn_settle_paid_intent', async () => {
    const sb = makeSupabase({
      rpcByFn: {
        fn_apply_topup: { data: null },
        fn_settle_paid_intent: { data: 'int-1' },
      },
      selectRow: { id: 'bp-1', intent_id: 'int-1' },
    });
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);

    const res = await POST(
      jsonReq({
        event: 'payment.succeeded',
        object: { id: 'yp-1', status: 'succeeded', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(200);
    expect(sb._rpc).toHaveBeenCalledWith('fn_apply_topup', expect.any(Object));
    expect(sb._rpc).toHaveBeenCalledWith('fn_settle_paid_intent', {
      p_billing_payment_id: 'bp-1',
    });
  });

  it('payment.succeeded with intent: fn_settle_paid_intent replay (data=null) → still 200', async () => {
    const sb = makeSupabase({
      rpcByFn: {
        fn_apply_topup: { data: null },
        fn_settle_paid_intent: { data: null }, // replay no-op
      },
      selectRow: { id: 'bp-1', intent_id: 'int-1' },
    });
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);

    const res = await POST(
      jsonReq({
        event: 'payment.succeeded',
        object: { id: 'yp-1', status: 'succeeded', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(200);
  });

  it('payment.succeeded with intent: fn_settle_paid_intent errors → 500 (Codex audit D #3: ЮKassa retries)', async () => {
    const sb = makeSupabase({
      rpcByFn: {
        fn_apply_topup: { data: null },
        fn_settle_paid_intent: { error: { code: 'XX000', message: 'deadlock' } },
      },
      selectRow: { id: 'bp-1', intent_id: 'int-1' },
    });
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(
      jsonReq({
        event: 'payment.succeeded',
        object: { id: 'yp-1', status: 'succeeded', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    // Codex audit D #3 fix: return 500 so ЮKassa retries with exp backoff;
    // fn_apply_topup + fn_settle_paid_intent are both idempotent → safe.
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalledWith(
      '[yookassa] fn_settle_paid_intent failed',
      expect.objectContaining({ paymentId: 'bp-1', intentId: 'int-1' }),
    );
    errSpy.mockRestore();
  });

  it('payment.succeeded: payment lookup fails → still 200 (non-fatal, balance already credited)', async () => {
    const sb = makeSupabase({
      rpcByFn: { fn_apply_topup: { data: null } },
      selectError: { code: 'PGRST116', message: 'no rows' },
    });
    (getServiceRoleSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(
      jsonReq({
        event: 'payment.succeeded',
        object: { id: 'yp-1', status: 'succeeded', amount: { value: '2000.00', currency: 'RUB' } },
      }),
    );

    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
