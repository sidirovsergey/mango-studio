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

function makeSupabase(
  user: { id: string; email: string | null; is_anonymous?: boolean } | null,
  insertError: { code: string; message: string } | null = null,
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
    }),
  };
}

describe('createTopupAction', () => {
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
      makeSupabase(null),
    );
    await expect(createTopupAction({ package_code: 'topup_2000' })).rejects.toThrow(
      '__redirect:/login',
    );
  });

  it('redirects to /login when user is anonymous', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({ id: 'u1', email: null, is_anonymous: true }),
    );
    await expect(createTopupAction({ package_code: 'topup_2000' })).rejects.toThrow(
      '__redirect:/login',
    );
  });

  it('redirects to /login when user has no email', async () => {
    (getServerSupabase as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({ id: 'u1', email: null }),
    );
    await expect(createTopupAction({ package_code: 'topup_2000' })).rejects.toThrow(
      '__redirect:/login',
    );
  });

  it('happy path: 2000₽ → ЮKassa create → INSERT billing_payments → returns confirmation_url', async () => {
    const sb = makeSupabase({ id: 'u1', email: 'a@b.ru', is_anonymous: false });
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
    }

    // ЮKassa called with 2000.00 ₽ = 200_000 kopeks
    expect(createYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_kopeks: 200_000,
        customer_email: 'a@b.ru',
        metadata: { user_id: 'u1', package_code: 'topup_2000' },
        return_url: 'https://mangopro.ru/profile?topup=pending',
      }),
    );

    // Idempotence-Key follows topup:u1:topup_2000:<minute> pattern
    const call = (createYooKassaPayment as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.idempotence_key).toMatch(/^topup:u1:topup_2000:\d+$/);

    // billing_payments INSERT
    expect(sb.from).toHaveBeenCalledWith('billing_payments');
  });

  it('idempotent retry: UNIQUE constraint violation (23505) on billing_payments → still returns confirmation_url', async () => {
    const sb = makeSupabase(
      { id: 'u1', email: 'a@b.ru' },
      { code: '23505', message: 'duplicate key' },
    );
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
      makeSupabase({ id: 'u1', email: 'a@b.ru' }),
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
    const sb = makeSupabase(
      { id: 'u1', email: 'a@b.ru' },
      { code: '23502', message: 'null violation' },
    );
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
    const sb = makeSupabase({ id: 'u1', email: 'a@b.ru' });
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
