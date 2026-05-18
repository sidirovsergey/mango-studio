import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`__redirect:${url}`);
  }),
}));

vi.mock('@mango/db/server', () => ({
  getServerSupabase: vi.fn(),
}));

vi.mock('@/server/lib/yookassa-client', () => ({
  createYooKassaPayment: vi.fn(),
}));

import { createYooKassaPayment } from '@/server/lib/yookassa-client';
import { getServerSupabase } from '@mango/db/server';
import { createTopupAction } from './createTopupAction';

/**
 * Flexible Supabase mock that supports:
 *  - .from(table).insert(row) → { error }
 *  - .from(table).select(cols).eq(col, val).single() → { data, error }
 *  - .rpc(fn, args) → { data, error }
 *
 * The behavior is customised per test via the `opts` argument.
 */
function makeSupabase(opts: {
  user: { id: string; email: string | null; is_anonymous?: boolean } | null;
  insertError?: { code: string; message: string } | null;
  selectRow?: Record<string, unknown> | null;
  selectError?: { code: string; message: string } | null;
  rpcByFn?: Record<
    string,
    {
      data?: unknown;
      error?: { code: string; message: string } | null;
    }
  >;
}) {
  const insertMock = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });
  const singleMock = vi
    .fn()
    .mockResolvedValue({ data: opts.selectRow ?? null, error: opts.selectError ?? null });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({
    insert: insertMock,
    select: selectMock,
  });
  const rpcMock = vi.fn().mockImplementation((fnName: string) => {
    const r = opts.rpcByFn?.[fnName];
    return Promise.resolve({ data: r?.data ?? null, error: r?.error ?? null });
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user }, error: null }),
    },
    from: fromMock,
    rpc: rpcMock,
    _mocks: { insertMock, selectMock, eqMock, singleMock, fromMock, rpcMock },
  };
}

const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('createTopupAction — legacy v1.7.0 behavior preserved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('YOOKASSA_SHOP_ID', 'shop');
    vi.stubEnv('YOOKASSA_SECRET_KEY', 'secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects invalid package_code', async () => {
    const result = await createTopupAction({ package_code: 'topup_42000' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_package');
    expect(getServerSupabase).not.toHaveBeenCalled();
  });

  it('rejects missing package_code', async () => {
    const result = await createTopupAction({});
    expect(result.ok).toBe(false);
  });

  it('redirects to /login when user is null', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({ user: null }),
    );
    await expect(createTopupAction({ package_code: 'topup_2000' })).rejects.toThrow(
      '__redirect:/login',
    );
  });

  it('redirects to /login when user is anonymous', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({ user: { id: 'u1', email: null, is_anonymous: true } }),
    );
    await expect(createTopupAction({ package_code: 'topup_2000' })).rejects.toThrow(
      '__redirect:/login',
    );
  });

  it('redirects to /login when user has no email', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({ user: { id: 'u1', email: null } }),
    );
    await expect(createTopupAction({ package_code: 'topup_2000' })).rejects.toThrow(
      '__redirect:/login',
    );
  });

  it('legacy topup_only happy path: returns confirmation_url, no nonce, no intent RPC', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru', is_anonymous: false },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'yp-1',
      status: 'pending',
      amount: { value: '2000.00', currency: 'RUB' },
      confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-1' },
      metadata: { user_id: 'u1', package_code: 'topup_2000' },
    });

    const result = await createTopupAction({ package_code: 'topup_2000' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmation_url).toBe('https://yk/c/yp-1');
      expect(result.payment_id).toBe('yp-1');
      expect(result.nonce).toBeUndefined();
    }
    // Legacy path: NO intent RPC fired.
    expect(sb._mocks.rpcMock).not.toHaveBeenCalled();
    // Legacy return_url remained.
    expect(createYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_kopeks: 200_000,
        return_url: 'https://mangopro.ru/profile?topup=pending',
        metadata: { user_id: 'u1', package_code: 'topup_2000' },
      }),
    );
    expect(sb.from).toHaveBeenCalledWith('billing_payments');
    expect(sb._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ intent_id: null }),
    );
  });

  it('idempotent retry: UNIQUE constraint violation (23505) on billing_payments → still returns confirmation_url', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      insertError: { code: '23505', message: 'duplicate key' },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'yp-1',
      status: 'pending',
      amount: { value: '2000.00', currency: 'RUB' },
      confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-1' },
      metadata: {},
    });

    const result = await createTopupAction({ package_code: 'topup_2000' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.confirmation_url).toBe('https://yk/c/yp-1');
  });

  it('returns yookassa_error when createYooKassaPayment throws', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({ user: { id: 'u1', email: 'a@b.ru' } }),
    );
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('HTTP 502 yookassa down'),
    );

    const result = await createTopupAction({ package_code: 'topup_2000' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('yookassa_error');
      expect(result.error.message).toContain('HTTP 502');
    }
  });

  it('returns DB error when billing_payments INSERT fails with non-23505 code', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      insertError: { code: '23502', message: 'null violation' },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'yp-1',
      status: 'pending',
      amount: { value: '2000.00', currency: 'RUB' },
      confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-1' },
      metadata: {},
    });
    const result = await createTopupAction({ package_code: 'topup_2000' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('23502');
  });

  it('topup_5000 and topup_10000 packages map to correct kopeks', async () => {
    const sb = makeSupabase({ user: { id: 'u1', email: 'a@b.ru' } });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'yp-1',
      status: 'pending',
      amount: { value: '5000.00', currency: 'RUB' },
      confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-1' },
      metadata: {},
    });
    await createTopupAction({ package_code: 'topup_5000' });
    expect(createYooKassaPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount_kopeks: 500_000 }),
    );

    await createTopupAction({ package_code: 'topup_10000' });
    expect(createYooKassaPayment).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount_kopeks: 1_000_000 }),
    );
  });
});

describe('createTopupAction — Phase 1.7.1 intent path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('YOOKASSA_SHOP_ID', 'shop');
    vi.stubEnv('YOOKASSA_SECRET_KEY', 'secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('render intent: creates new intent + nonced return_url + intent_nonce in metadata', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      rpcByFn: {
        fn_get_or_create_intent: {
          data: [
            {
              intent_id: 'int-1',
              out_nonce: 'aBcDeFgHiJkLmNoP', // 16 chars — same length the action generates
              out_billing_payment_id: null,
              is_new: true,
            },
          ],
        },
        fn_link_payment_to_intent: { data: true },
      },
      selectRow: { id: 'bp-local-1' }, // for the post-insert lookup that feeds fn_link
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'yp-1',
      status: 'pending',
      amount: { value: '2000.00', currency: 'RUB' },
      confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-1' },
      metadata: {},
    });

    const result = await createTopupAction({
      package_code: 'topup_2000',
      intent: { kind: 'render', project_id: VALID_UUID, return_to: '/p/abc' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmation_url).toBe('https://yk/c/yp-1');
      expect(result.nonce).toBe('aBcDeFgHiJkLmNoP');
    }
    // fn_get_or_create_intent called with the right args.
    expect(sb._mocks.rpcMock).toHaveBeenCalledWith(
      'fn_get_or_create_intent',
      expect.objectContaining({
        p_user_id: 'u1',
        p_project_id: VALID_UUID,
        p_kind: 'render',
        p_return_to: '/p/abc',
      }),
    );
    // ЮKassa called with nonced return_url + intent_nonce in metadata.
    expect(createYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: 'https://mangopro.ru/p/abc?nonce=aBcDeFgHiJkLmNoP',
        metadata: expect.objectContaining({ intent_nonce: 'aBcDeFgHiJkLmNoP' }),
      }),
    );
    // fn_link_payment_to_intent called after INSERT.
    expect(sb._mocks.rpcMock).toHaveBeenCalledWith(
      'fn_link_payment_to_intent',
      expect.objectContaining({ p_intent_id: 'int-1', p_billing_payment_id: 'bp-local-1' }),
    );
  });

  it('two-tab reuse: existing intent already has billing_payment_id (status=pending) → reuses URL, NO ЮKassa.create', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      rpcByFn: {
        fn_get_or_create_intent: {
          data: [
            {
              intent_id: 'int-1',
              out_nonce: 'AAAAAAAAAAAAAAAA',
              out_billing_payment_id: 'bp-existing-1',
              is_new: false,
            },
          ],
        },
      },
      selectRow: {
        id: 'bp-existing-1',
        status: 'pending',
        metadata: {
          confirmation: { confirmation_url: 'https://yk/c/yp-prev' },
        },
      },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const result = await createTopupAction({
      package_code: 'topup_5000',
      intent: { kind: 'render', project_id: VALID_UUID, return_to: '/p/xyz' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmation_url).toBe('https://yk/c/yp-prev');
      expect(result.payment_id).toBe('bp-existing-1');
      expect(result.nonce).toBe('AAAAAAAAAAAAAAAA');
    }
    // Critical: ЮKassa NOT called again — second tab reuses the first tab's payment.
    expect(createYooKassaPayment).not.toHaveBeenCalled();
  });

  it('two-tab reuse: existing payment metadata missing confirmation_url → error', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      rpcByFn: {
        fn_get_or_create_intent: {
          data: [
            {
              intent_id: 'int-1',
              out_nonce: 'AAAAAAAAAAAAAAAA',
              out_billing_payment_id: 'bp-broken',
              is_new: false,
            },
          ],
        },
      },
      selectRow: { id: 'bp-broken', status: 'pending', metadata: {} },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const result = await createTopupAction({
      package_code: 'topup_2000',
      intent: { kind: 'render', project_id: VALID_UUID, return_to: '/p/abc' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('payment_url_missing');
  });

  it('reuse path: existing payment status=canceled → returns intent_payment_dead error', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      rpcByFn: {
        fn_get_or_create_intent: {
          data: [
            {
              intent_id: 'int-1',
              out_nonce: 'AAAAAAAAAAAAAAAA',
              out_billing_payment_id: 'bp-canceled',
              is_new: false,
            },
          ],
        },
      },
      selectRow: {
        id: 'bp-canceled',
        status: 'canceled',
        metadata: { confirmation: { confirmation_url: 'https://yk/c/dead' } },
      },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const result = await createTopupAction({
      package_code: 'topup_2000',
      intent: { kind: 'render', project_id: VALID_UUID, return_to: '/p/abc' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('intent_payment_dead');
    expect(createYooKassaPayment).not.toHaveBeenCalled();
  });

  it('intent flow uses intent-scoped Idempotence-Key (Codex audit C #1)', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      rpcByFn: {
        fn_get_or_create_intent: {
          data: [
            {
              intent_id: 'int-1',
              out_nonce: 'aBcDeFgHiJkLmNoP',
              out_billing_payment_id: null,
              is_new: true,
            },
          ],
        },
        fn_link_payment_to_intent: { data: true },
      },
      selectRow: { id: 'bp-local-1' },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'yp-1',
      confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-1' },
      metadata: {},
    });

    await createTopupAction({
      package_code: 'topup_2000',
      intent: { kind: 'render', project_id: VALID_UUID, return_to: '/p/abc' },
    });

    expect(createYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotence_key: 'topup-intent:int-1' }),
    );
  });

  it('return_url preserves existing query params (Codex audit C #3, URL ctor)', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      rpcByFn: {
        fn_get_or_create_intent: {
          data: [
            {
              intent_id: 'int-1',
              out_nonce: 'NONCE12345678901',
              out_billing_payment_id: null,
              is_new: true,
            },
          ],
        },
        fn_link_payment_to_intent: { data: true },
      },
      selectRow: { id: 'bp-local-1' },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'yp-1',
      confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/yp-1' },
      metadata: {},
    });

    await createTopupAction({
      package_code: 'topup_2000',
      intent: { kind: 'render', project_id: VALID_UUID, return_to: '/p/abc?foo=bar' },
    });

    const call = (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // Existing ?foo=bar preserved; nonce appended as additional param.
    expect(call.return_url).toBe('https://mangopro.ru/p/abc?foo=bar&nonce=NONCE12345678901');
  });

  it('fn_get_or_create_intent RPC error → returns intent_error', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      rpcByFn: {
        fn_get_or_create_intent: {
          error: { code: 'P0001', message: 'project ownership check failed' },
        },
      },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);

    const result = await createTopupAction({
      package_code: 'topup_2000',
      intent: { kind: 'render', project_id: VALID_UUID, return_to: '/p/abc' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('P0001');
      expect(result.error.message).toContain('ownership');
    }
    expect(createYooKassaPayment).not.toHaveBeenCalled();
  });

  it('studio intent: creates intent but webhook will NOT auto-dispatch (no enqueue)', async () => {
    const sb = makeSupabase({
      user: { id: 'u1', email: 'a@b.ru' },
      rpcByFn: {
        fn_get_or_create_intent: {
          data: [
            {
              intent_id: 'int-studio-1',
              out_nonce: 'STUDIO1234567890',
              out_billing_payment_id: null,
              is_new: true,
            },
          ],
        },
        fn_link_payment_to_intent: { data: true },
      },
      selectRow: { id: 'bp-local-2' },
    });
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sb);
    (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'yp-studio',
      confirmation: { type: 'redirect', confirmation_url: 'https://yk/c/studio' },
      metadata: {},
    });

    const result = await createTopupAction({
      package_code: 'topup_10000',
      intent: { kind: 'studio', project_id: VALID_UUID, return_to: '/p/xyz/studio' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nonce).toBe('STUDIO1234567890');
    }
    expect(createYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: 'https://mangopro.ru/p/xyz/studio?nonce=STUDIO1234567890',
      }),
    );
  });
});
